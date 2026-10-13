import { useSyncExternalStore } from 'react';
import type { Socket } from 'socket.io-client';
import type { Message, User } from '../types';

/*
 * Очередь исходящих сообщений.
 *
 * Раньше сообщение уходило через socket.emit без ответа, а поле ввода
 * очищалось сразу. Порвалась связь в этот момент — текст пропадал молча.
 * Теперь у каждого сообщения есть метка (nonce): пока сервер не подтвердил
 * отправку, оно висит в ленте полупрозрачным, при отказе — с кнопкой
 * «Повторить». Повтор идёт с той же меткой, и сервер не создаст копию, даже
 * если первая попытка на самом деле дошла.
 *
 * Сами ленты (messages в Main) очередь не трогает: ChannelView и DMView
 * дорисовывают её записи в конец и прячут те, что уже пришли с сервера.
 */

export type OutboxStatus = 'sending' | 'failed' | 'sent';

export interface OutboxEntry {
  nonce: string;
  chatId: string;
  payload: Record<string, any>;
  message: Message;
  status: OutboxStatus;
  error?: string;
  messageId?: string;
}

export type PendingMessage = Message & {
  nonce?: string;
  _pending?: 'sending' | 'failed';
  _error?: string;
};

// Сервер может несколько секунд собирать превью ссылок — ждём с запасом.
const ACK_TIMEOUT = 20000;
// Подтверждённое сообщение держим, пока оно не появится в ленте из new-message.
const SENT_LINGER = 30000;
const STORAGE_KEY = 'zvon:outbox';

const entries = new Map<string, OutboxEntry>();
const listeners = new Set<() => void>();
let version = 0;
let socketRef: Socket | null = null;
let restoredFor: string | null = null;

const makeNonce = () => {
  const c: any = (globalThis as any).crypto;
  return c?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const emit = () => {
  version++;
  persist();
  listeners.forEach(l => l());
};

/*
 * Неотправленное переживает перезапуск: приложение закрыли, пока висело
 * «Не отправлено», — после входа оно на месте. Само не повторяется: прошло
 * неизвестно сколько времени, и решать, слать ли старый текст, человеку.
 */
const persist = () => {
  try {
    const list = Array.from(entries.values())
      .filter(e => e.status !== 'sent')
      .map(({ nonce, chatId, payload, message }) => ({ nonce, chatId, payload, message }));
    if (list.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* хранилище недоступно — очередь живёт до перезапуска */ }
};

export function restoreOutbox(userId: string) {
  if (restoredFor === userId) return;
  restoredFor = userId;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item?.nonce || String(item.message?.author?._id) !== String(userId)) continue;
      if (entries.has(item.nonce)) continue;
      entries.set(item.nonce, { ...item, status: 'failed', error: 'Не отправлено до закрытия приложения' });
    }
    emit();
  } catch { /* повреждённая запись — просто начинаем с пустой очереди */ }
}

const update = (nonce: string, patch: Partial<OutboxEntry>) => {
  const entry = entries.get(nonce);
  if (!entry) return;
  entries.set(nonce, { ...entry, ...patch });
  emit();
};

const attempt = (nonce: string) => {
  const entry = entries.get(nonce);
  const socket = socketRef;
  if (!entry || !socket) return;
  update(nonce, { status: 'sending', error: undefined });
  // Нет связи — не тратим попытку: отправим по событию connect.
  if (!socket.connected) return;
  socket.timeout(ACK_TIMEOUT).emit('send-message', { ...entry.payload, nonce }, (err: any, res: any) => {
    if (!entries.has(nonce)) return; // человек уже убрал сообщение
    if (err) {
      // Связь пропала, пока ждали ответа, — дождёмся её и повторим.
      if (!socket.connected) return;
      update(nonce, { status: 'failed', error: 'Сервер не ответил' });
      return;
    }
    if (res?.error) {
      update(nonce, { status: 'failed', error: res.error });
      return;
    }
    update(nonce, { status: 'sent', messageId: res?.messageId ? String(res.messageId) : undefined });
    setTimeout(() => {
      if (entries.get(nonce)?.status === 'sent') { entries.delete(nonce); emit(); }
    }, SENT_LINGER);
  });
};

const onConnect = () => {
  entries.forEach(e => { if (e.status === 'sending') attempt(e.nonce); });
};

const bindSocket = (socket: Socket) => {
  if (socketRef === socket) return;
  socketRef?.off('connect', onConnect);
  socketRef = socket;
  socket.on('connect', onConnect);
};

export function sendChatMessage(
  socket: Socket,
  chatId: string,
  payload: Record<string, any>,
  author: User,
  replyTo?: Message | null,
) {
  bindSocket(socket);
  const nonce = makeNonce();
  const message: PendingMessage = {
    _id: `pending-${nonce}`,
    nonce,
    content: payload.content || '',
    author,
    channel: payload.channelId || null,
    directMessage: payload.dmId || null,
    attachments: payload.attachments || [],
    poll: payload.poll
      ? { ...payload.poll, options: (payload.poll.options || []).map((o: any, i: number) => ({ id: String(i), text: o.text, voters: [] })) }
      : null,
    replyTo: replyTo || undefined,
    edited: false,
    reactions: [],
    createdAt: new Date().toISOString(),
  };
  entries.set(nonce, { nonce, chatId, payload, message, status: 'sending' });
  emit();
  attempt(nonce);
}

export function retryMessage(nonce: string, socket?: Socket | null) {
  if (socket) bindSocket(socket);
  attempt(nonce);
}

export function discardMessage(nonce: string) {
  if (entries.delete(nonce)) emit();
}

export function getOutboxEntry(nonce: string) {
  return entries.get(nonce);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getVersion = () => version;

/*
 * Записи очереди для одного чата, ещё не появившиеся в его ленте.
 * Сообщение считается пришедшим, если в ленте есть его метка или id из
 * подтверждения сервера, — тогда запись убираем и из очереди.
 */
export function useOutboxMessages(chatId: string, messages: Message[]): PendingMessage[] {
  useSyncExternalStore(subscribe, getVersion);
  const list = Array.from(entries.values()).filter(e => e.chatId === chatId);
  if (list.length === 0) return EMPTY;
  const seenNonces = new Set<string>();
  const seenIds = new Set<string>();
  // Свои сообщения ищем только в хвосте ленты — они всегда там.
  for (let i = messages.length - 1; i >= 0 && i >= messages.length - 100; i--) {
    const m = messages[i] as PendingMessage;
    if (m.nonce) seenNonces.add(m.nonce);
    seenIds.add(m._id);
  }
  const out: PendingMessage[] = [];
  for (const e of list) {
    if (seenNonces.has(e.nonce) || (e.messageId && seenIds.has(e.messageId))) {
      // Убираем вне рендера, чтобы не дёргать подписчиков посреди него.
      queueMicrotask(() => { if (entries.delete(e.nonce)) emit(); });
      continue;
    }
    // Подтверждено, но в ленту ещё не пришло — показываем как обычное.
    out.push({
      ...(e.message as PendingMessage),
      _pending: e.status === 'sent' ? undefined : e.status,
      _error: e.error,
    });
  }
  return out;
}

const EMPTY: PendingMessage[] = [];

export const isPendingMessage = (m: Message) => !!(m as PendingMessage)._pending || m._id.startsWith('pending-');
