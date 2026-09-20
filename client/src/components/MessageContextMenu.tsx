import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import { Message, User, Server } from '../types';
import {
  ReplyIcon,
  CopyIcon,
  PinIcon,
  ForwardIcon,
  TrashIcon,
  PlusIcon,
  UsersIcon,
  ChatIcon,
  ShieldIcon,
} from './Icons';
import UserAvatar from './UserAvatar';
import ReportModal from './ReportModal';
import { useDialog } from '../contexts/DialogContext';
import axios from 'axios';
import './MessageContextMenu.css';

export interface MessageContextMenuProps {
  message: Message;
  x: number;
  y: number;
  isMobile: boolean;
  onClose: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: Message) => void;
  onTogglePin?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  canPin?: boolean;
  canReact?: boolean;
  canDelete?: boolean;
  user: User | null;
  server?: Server;
  onUserClick?: (userId: string, event?: React.MouseEvent) => void;
  onMention?: (username: string) => void;
  onOpenEmojiPicker?: (pos: { x: number; y: number; msgId: string }) => void;
}

const QUICK_EMOJIS = ['❤️', '👍', '🔥', '😂', '🎉', '😮', '😢', '🚀'];

const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  message,
  x,
  y,
  isMobile,
  onClose,
  onReact,
  onReply,
  onTogglePin,
  onDelete,
  canPin = false,
  canReact = true,
  canDelete = false,
  user,
  server,
  onUserClick,
  onMention,
  onOpenEmojiPicker,
}) => {
  const { alert } = useDialog();
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ top: y, left: x });
  const [showReportModal, setShowReportModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const targetUser = message.author;
  const isSelf = user?._id === targetUser._id;
  const authorName = targetUser.displayName || targetUser.username;

  // Guard against ghost-clicks: on mobile, ignore any clicks/taps until the user
  // has released their finger from the long-press and the sheet has animated in.
  const [isInteractive, setIsInteractive] = useState(!isMobile);
  useEffect(() => {
    if (!isMobile) return;
    const timer = setTimeout(() => {
      setIsInteractive(true);
    }, 320);
    return () => clearTimeout(timer);
  }, [isMobile]);

  // Position calculation for desktop popover
  useEffect(() => {
    if (isMobile) return;

    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      let finalX = x;
      let finalY = y;

      if (finalX + rect.width > window.innerWidth) {
        finalX = window.innerWidth - rect.width - 16;
      }
      if (finalY + rect.height > window.innerHeight) {
        finalY = window.innerHeight - rect.height - 16;
      }

      setAdjustedPos({
        top: Math.max(12, finalY),
        left: Math.max(12, finalX),
      });
    }
  }, [x, y, isMobile]);

  // Click outside to close (desktop)
  useEffect(() => {
    if (isMobile) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (showReportModal) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, showReportModal, isMobile]);

  // Handle touch swipe down to close on mobile
  const touchStartY = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    if (dy > 60 && menuRef.current && menuRef.current.scrollTop <= 5) {
      onClose();
    }
  };

  const handleCopy = useCallback(() => {
    if (!isInteractive) return;
    const text = message.content;
    if ((window as any).electron?.clipboard) {
      (window as any).electron.clipboard.writeText(text);
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => {
      onClose();
    }, 400);
  }, [message.content, onClose, isInteractive]);

  const handleQuickReaction = (emoji: string) => {
    if (!isInteractive) return;
    onReact(message._id, emoji);
    onClose();
  };

  const handleOpenFullEmojiPicker = (e: React.MouseEvent) => {
    if (!isInteractive) return;
    onOpenEmojiPicker?.({
      x: isMobile ? window.innerWidth / 2 : e.clientX,
      y: isMobile ? window.innerHeight / 2 : e.clientY,
      msgId: message._id,
    });
    onClose();
  };

  const handleSendDM = async () => {
    if (!isInteractive) return;
    try {
      const dmRes = await axios.get(`/api/direct-messages/user/${targetUser._id}`);
      window.dispatchEvent(new CustomEvent('start-dm', { detail: { dm: dmRes.data } }));
    } catch (_) {}
    onClose();
  };

  if (showReportModal) {
    return ReactDOM.createPortal(
      <ReportModal
        isOpen={showReportModal}
        username={authorName}
        onClose={() => {
          setShowReportModal(false);
          onClose();
        }}
        onSubmit={async (data) => {
          setShowReportModal(false);
          onClose();
          try {
            await axios.post('/api/moderation/report', {
              ...data,
              userId: targetUser._id,
              messageId: message._id,
            });
            await alert('Жалоба отправлена. Модераторы проверят её в ближайшее время.');
          } catch (_) {
            await alert('Не удалось отправить жалобу.');
          }
        }}
      />,
      document.body
    );
  }

  const content = (
    <React.Fragment>
      {/* Backdrop for mobile */}
      {isMobile && (
        <motion.div
          className="message-context-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => {
            if (!isInteractive) return;
            onClose();
          }}
          style={{ pointerEvents: isInteractive ? 'auto' : 'none' }}
        />
      )}

      <motion.div
        ref={menuRef}
        className={`message-context-menu ${isMobile ? 'is-mobile-sheet' : 'is-desktop-popover'}`}
        style={!isMobile ? { top: adjustedPos.top, left: adjustedPos.left } : undefined}
        initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.94 }}
        animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
        exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.96 }}
        transition={
          isMobile
            ? { type: 'spring', stiffness: 420, damping: 36, mass: 0.8 }
            : { type: 'spring', stiffness: 500, damping: 34 }
        }
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile handle */}
        {isMobile && (
          <div className="sheet-drag-handle-wrap">
            <div className="sheet-drag-handle" />
          </div>
        )}

        {/* Message snippet preview on mobile */}
        {isMobile && (
          <div className="message-context-header">
            <UserAvatar user={targetUser} size={28} className="message-context-avatar" />
            <div className="message-context-author-info">
              <span className="message-context-author-name">{authorName}</span>
              <span className="message-context-snippet">
                {message.content || (message.attachments?.length ? 'Вложение' : 'Сообщение')}
              </span>
            </div>
          </div>
        )}

        {/* Quick Reactions Bar */}
        {canReact && (
          <div className="message-context-reactions-bar">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="context-reaction-btn"
                onClick={() => handleQuickReaction(emoji)}
                title={`Реакция ${emoji}`}
              >
                {emoji}
              </button>
            ))}
            {onOpenEmojiPicker && (
              <button
                key="add-reaction"
                type="button"
                className="context-reaction-btn add-more"
                onClick={handleOpenFullEmojiPicker}
                title="Все реакции"
              >
                <PlusIcon size={16} />
              </button>
            )}
          </div>
        )}

        {/* --- MESSAGE ACTIONS GROUP --- */}
        <div className="message-context-group">
          <button
            type="button"
            className="message-context-item"
            onClick={() => {
              if (!isInteractive) return;
              onReply(message);
              onClose();
            }}
          >
            <ReplyIcon size={16} />
            <span>Ответить</span>
          </button>

          <button
            type="button"
            className="message-context-item"
            onClick={handleCopy}
          >
            <CopyIcon size={16} />
            <span>{copied ? 'Скопировано!' : 'Копировать текст'}</span>
          </button>

          {canPin && onTogglePin && (
            <button
              type="button"
              className="message-context-item"
              onClick={() => {
                if (!isInteractive) return;
                onTogglePin(message._id);
                onClose();
              }}
            >
              <PinIcon size={16} fill={message.pinned ? 'var(--primary-neon)' : 'none'} color={message.pinned ? 'var(--primary-neon)' : 'currentColor'} />
              <span>{message.pinned ? 'Открепить сообщение' : 'Закрепить сообщение'}</span>
            </button>
          )}

          <button
            type="button"
            className="message-context-item"
            onClick={() => {
              if (!isInteractive) return;
              window.dispatchEvent(new CustomEvent('open-forward', { detail: { message } }));
              onClose();
            }}
          >
            <ForwardIcon size={16} />
            <span>Переслать</span>
          </button>

          {canDelete && onDelete && (
            <button
              type="button"
              className="message-context-item destructive"
              onClick={() => {
                if (!isInteractive) return;
                onDelete(message._id);
                onClose();
              }}
            >
              <TrashIcon size={16} />
              <span>Удалить сообщение</span>
            </button>
          )}
        </div>

        <div className="message-context-divider" />

        {/* --- AUTHOR QUICK ACTIONS --- */}
        <div className="message-context-group">
          {onMention && !isSelf && (
            <button
              type="button"
              className="message-context-item"
              onClick={() => {
                if (!isInteractive) return;
                onMention(targetUser.username);
                onClose();
              }}
            >
              <span className="mention-at-symbol">@</span>
              <span>Упомянуть автора</span>
            </button>
          )}

          {onUserClick && (
            <button
              type="button"
              className="message-context-item"
              onClick={() => {
                if (!isInteractive) return;
                onUserClick(targetUser._id);
                onClose();
              }}
            >
              <UsersIcon size={16} />
              <span>Профиль {authorName}</span>
            </button>
          )}

          {server && !isSelf && (
            <button
              type="button"
              className="message-context-item"
              onClick={handleSendDM}
            >
              <ChatIcon size={16} />
              <span>Написать в ЛС</span>
            </button>
          )}

          {!isSelf && (
            <button
              type="button"
              className="message-context-item destructive"
              onClick={() => {
                if (!isInteractive) return;
                setShowReportModal(true);
              }}
            >
              <ShieldIcon size={16} />
              <span>Пожаловаться</span>
            </button>
          )}
        </div>
      </motion.div>
    </React.Fragment>
  );

  return ReactDOM.createPortal(content, document.body);
};

export default MessageContextMenu;
