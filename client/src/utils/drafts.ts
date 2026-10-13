import { useSyncExternalStore } from 'react';
import type { Message } from '../types';

/*
 * Черновики поля ввода по чатам.
 *
 * ChannelView и DMView не пересоздаются при смене чата, и раньше набранный
 * текст либо терялся, либо переезжал в соседний чат. Теперь у каждого чата
 * свой черновик: текст лежит в localStorage и переживает перезапуск, а ответ
 * и уже загруженные вложения — только в памяти (вложения — это ссылки на
 * загруженные файлы, после перезапуска их показывать незачем).
 */

const STORAGE_KEY = 'zvon:drafts';
// Черновики, к которым не возвращались месяц, выбрасываем.
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

interface StoredDraft { text: string; at: number; }

export interface ComposerExtras {
  replyTo: Message | null;
  attachments: any[];
}

const load = (): Record<string, StoredDraft> => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const now = Date.now();
    const out: Record<string, StoredDraft> = {};
    for (const [id, d] of Object.entries<any>(raw)) {
      if (d && typeof d.text === 'string' && d.text.trim() && now - (d.at || 0) < MAX_AGE) out[id] = d;
    }
    return out;
  } catch {
    return {};
  }
};

let drafts: Record<string, StoredDraft> = load();
const extras = new Map<string, ComposerExtras>();
const listeners = new Set<() => void>();
let idsSnapshot = Object.keys(drafts).sort().join(',');
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const save = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts)); } catch { /* без хранилища — до перезапуска */ }
  }, 400);
};

// Подписчиков (значки в боковых панелях) будим, только когда меняется
// набор чатов с черновиком, а не на каждую нажатую клавишу.
const notifyIfIdsChanged = () => {
  const ids = Object.keys(drafts).sort().join(',');
  if (ids === idsSnapshot) return;
  idsSnapshot = ids;
  listeners.forEach(l => l());
};

export function getDraft(chatId: string): string {
  return drafts[chatId]?.text || '';
}

export function setDraft(chatId: string, text: string) {
  if (text.trim()) drafts = { ...drafts, [chatId]: { text, at: Date.now() } };
  else if (drafts[chatId]) {
    const { [chatId]: _, ...rest } = drafts;
    drafts = rest;
  } else return;
  save();
  notifyIfIdsChanged();
}

export function getComposerExtras(chatId: string): ComposerExtras {
  return extras.get(chatId) || { replyTo: null, attachments: [] };
}

export function setComposerExtras(chatId: string, value: ComposerExtras) {
  if (!value.replyTo && value.attachments.length === 0) extras.delete(chatId);
  else extras.set(chatId, value);
}

export function clearDraft(chatId: string) {
  extras.delete(chatId);
  setDraft(chatId, '');
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getIds = () => idsSnapshot;

/** Набор чатов, где есть неотправленный текст, — для значка ✎ в списках. */
export function useDraftChatIds(): Set<string> {
  const ids = useSyncExternalStore(subscribe, getIds);
  return cachedSet(ids);
}

let lastIds = '';
let lastSet = new Set<string>();
const cachedSet = (ids: string) => {
  if (ids !== lastIds) {
    lastIds = ids;
    lastSet = new Set(ids ? ids.split(',') : []);
  }
  return lastSet;
};
