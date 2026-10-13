import React, { useCallback, useMemo, useState } from 'react';
import type { Message } from '../types';
import { isPendingMessage } from '../utils/outbox';
import { formatClockTime } from '../utils/time';
import { ArrowDownIcon } from './Icons';
import './ChatReliability.css';

/*
 * Первое непрочитанное сообщение в открытом чате.
 *
 * Считаем от отметки «прочитано», какой она была в момент открытия чата
 * (unreadSince), а не от счётчика: счётчик гаснет сразу при открытии, и
 * раньше из-за этого полоса «Новые сообщения» почти никогда не появлялась.
 */
export function useUnreadAnchor(
  chatId: string,
  messages: Message[],
  unreadSince: string | null | undefined,
  myId: string | undefined,
) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const key = `${chatId}:${unreadSince || ''}`;

  const { anchorId, count } = useMemo(() => {
    if (!unreadSince) return { anchorId: null as string | null, count: 0 };
    const since = new Date(unreadSince).getTime();
    let anchorId: string | null = null;
    let count = 0;
    for (const m of messages) {
      if (isPendingMessage(m) || m.author?._id === myId) continue;
      if (new Date(m.createdAt).getTime() <= since) continue;
      if (!anchorId) anchorId = m._id;
      count++;
    }
    return { anchorId, count };
  }, [messages, unreadSince, myId]);

  const dismissed = dismissedKey === key;
  const dismiss = useCallback(() => setDismissedKey(key), [key]);

  return {
    anchorId: dismissed ? null : anchorId,
    count,
    since: unreadSince || null,
    dismiss,
  };
}

interface UnreadJumpBarProps {
  count: number;
  since: string | null;
  onJump: () => void;
  onDismiss: () => void;
}

const pluralMessages = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'новое сообщение';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'новых сообщения';
  return 'новых сообщений';
};

/** Плашка над лентой: полоса «Новые сообщения» ушла выше видимой области. */
const UnreadJumpBar: React.FC<UnreadJumpBarProps> = ({ count, since, onJump, onDismiss }) => {
  if (count <= 0) return null;
  return (
    <div className="unread-jump-bar" role="status">
      <button type="button" className="unread-jump-main" onClick={onJump}>
        <ArrowDownIcon size={12} color="currentColor" className="unread-jump-arrow" />
        {count} {pluralMessages(count)}
        {since ? ` с ${formatClockTime(since)}` : ''}
      </button>
      <button type="button" className="unread-jump-dismiss" onClick={onDismiss}>
        Отметить прочитанным
      </button>
    </div>
  );
};

export default UnreadJumpBar;
