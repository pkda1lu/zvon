import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import axios from 'axios';
import type { Socket } from 'socket.io-client';
import type { Server } from '../types';
import { computePermissions, hasPermission, Permissions } from './permissions';

/*
 * Непрочитанное, которое хранит сервер (server/models/ReadState).
 *
 * Раньше счётчики жили только в памяти: после перезапуска обнулялись, между
 * устройствами не совпадали, а по каналам вне открытого не росли вовсе —
 * сокет состоит только в комнате открытого канала. Теперь:
 *  - при входе и после переподключения счётчики приходят с сервера;
 *  - о сообщениях в остальных каналах сервер шлёт channel-activity;
 *  - открытый чат помечается прочитанным, и другие устройства об этом узнают.
 */

interface Options {
  socket: Socket | null;
  userId: string | undefined;
  serversRef: React.MutableRefObject<Server[]>;
  /** Открытый сейчас чат: канал или личная переписка. */
  openChatId: string | null;
  unreadCounts: Record<string, number>;
  setUnreadCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  /** Меняется, когда в открытом чате появились сообщения. */
  activitySignal: number;
}

export interface UnreadSnapshot {
  chatId: string | null;
  since: string | null;
  count: number;
}

const MARK_DELAY = 700;

export function useReadStates({ socket, userId, serversRef, openChatId, unreadCounts, setUnreadCounts, activitySignal }: Options) {
  const lastReadRef = useRef<Record<string, string>>({});
  const openRef = useRef(openChatId);
  openRef.current = openChatId;
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const [, rerender] = useReducer((x: number) => x + 1, 0);

  /*
   * Сколько было непрочитанного и докуда дочитано — в момент открытия чата.
   * Снимаем прямо в рендере: счётчик открытого чата гасится эффектом сразу
   * после, а лента должна успеть открыться на первом непрочитанном.
   */
  const snapRef = useRef<UnreadSnapshot>({ chatId: null, since: null, count: 0 });
  if (snapRef.current.chatId !== openChatId) {
    const count = openChatId ? unreadCounts[openChatId] || 0 : 0;
    snapRef.current = {
      chatId: openChatId,
      count,
      since: openChatId && count > 0 ? lastReadRef.current[openChatId] || null : null,
    };
  }

  const pendingRef = useRef(new Set<string>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markRead = useCallback((chatIds: string[]) => {
    chatIds.forEach(id => pendingRef.current.add(id));
    setUnreadCounts(prev => {
      if (!chatIds.some(id => prev[id])) return prev;
      const next = { ...prev };
      chatIds.forEach(id => delete next[id]);
      return next;
    });
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const ids = Array.from(pendingRef.current);
      pendingRef.current.clear();
      // Без связи отметка потеряется — не страшно: чат снова пометится
      // прочитанным при следующем открытии или новом сообщении.
      if (ids.length) socketRef.current?.emit('mark-read', { chatIds: ids });
    }, MARK_DELAY);
  }, [setUnreadCounts]);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/read-states');
      const lastRead: Record<string, string> = {};
      for (const [id, at] of Object.entries<any>(data?.lastRead || {})) lastRead[id] = String(at);
      lastReadRef.current = lastRead;
      const unread: Record<string, number> = { ...(data?.unread || {}) };
      const open = openRef.current;
      // Открытый чат, где на сервере нашлось непрочитанное (например, сразу
      // после запуска), — показываем полосу «Новые сообщения» и в нём.
      if (open && unread[open] > 0 && snapRef.current.chatId === open && !snapRef.current.since) {
        snapRef.current = { chatId: open, count: unread[open], since: lastRead[open] || null };
        rerender();
      }
      if (open) delete unread[open];
      setUnreadCounts(unread);
      if (open && document.visibilityState === 'visible') markRead([open]);
    } catch { /* без ответа остаются счётчики из живых событий */ }
  }, [setUnreadCounts, markRead]);

  useEffect(() => {
    if (!socket || !userId) return;
    load();
    socket.io.on('reconnect', load);

    const onReadState = (data: { chatIds: string[]; lastReadAt: string }) => {
      const ids = (data?.chatIds || []).map(String);
      ids.forEach(id => { lastReadRef.current[id] = String(data.lastReadAt); });
      // Прочитано на другом устройстве — гасим счётчики и здесь.
      setUnreadCounts(prev => {
        if (!ids.some(id => prev[id])) return prev;
        const next = { ...prev };
        ids.forEach(id => delete next[id]);
        return next;
      });
    };

    const onChannelActivity = (data: { channelId: string; serverId: string; authorId: string }) => {
      if (!data?.channelId || String(data.authorId) === String(userId)) return;
      if (data.channelId === openRef.current) return;
      const server = serversRef.current.find(s => String(s._id) === String(data.serverId));
      const channel = server?.channels?.find(c => String(c._id) === String(data.channelId));
      if (!server || !channel) return;
      // Сигнал приходит всему серверу — скрытые от нас каналы не считаем.
      if (!hasPermission(computePermissions(userId, server, channel), Permissions.VIEW_CHANNEL)) return;
      setUnreadCounts(prev => ({ ...prev, [data.channelId]: (prev[data.channelId] || 0) + 1 }));
    };

    socket.on('read-state', onReadState);
    socket.on('channel-activity', onChannelActivity);
    return () => {
      socket.io.off('reconnect', load);
      socket.off('read-state', onReadState);
      socket.off('channel-activity', onChannelActivity);
    };
  }, [socket, userId, load, serversRef, setUnreadCounts]);

  // Открытый чат прочитан — но только пока окно на виду: сообщения, пришедшие
  // в свёрнутое приложение, остаются новыми до возвращения.
  useEffect(() => {
    if (!openChatId) return;
    if (document.visibilityState === 'visible') markRead([openChatId]);
  }, [openChatId, activitySignal, markRead]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && openRef.current) markRead([openRef.current]);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const unreadPropsFor = (chatId: string) => (
    snapRef.current.chatId === chatId
      ? { initialUnreadCount: snapRef.current.count, unreadSince: snapRef.current.since }
      : { initialUnreadCount: 0, unreadSince: null }
  );

  return { markRead, unreadPropsFor };
}
