import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChatScrollEngine, ChatScrollEngineHandle } from './ChatScrollEngine';
import { motion } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { Channel, Message, Server, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import axios from 'axios';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { formatClockTime } from '../utils/time';
import { HashtagIcon, DocumentIcon, PlusIcon, TrashIcon, DownloadIcon, PinIcon, ArrowDownIcon, ReplyIcon, CopyIcon, CameraIcon, SearchIcon, ForwardIcon, LockIcon, UsersIcon, SendIcon } from './Icons';
import MessageSearchPanel from './MessageSearchPanel';
import './panel-hero.css';
import './ChannelView.css';
import { useServerMemberMap } from '../utils/serverMembers';
import './Attachments.css';
import MemberContextMenu from './MemberContextMenu';
import CustomVideoPlayer from './CustomVideoPlayer';
import CustomAudioPlayer from './CustomAudioPlayer';
import MediaLightbox from './MediaLightbox';
import MentionAutocomplete from './MentionAutocomplete';
import ChannelAutocomplete from './ChannelAutocomplete';
import EmojiAutocomplete from './EmojiAutocomplete';
import { SkeletonList } from './Skeleton';
import { Role } from '../types';
import { computePermissions, hasPermission, Permissions } from '../utils/permissions';
import { useChatSettings } from '../contexts/ChatSettingsContext';
import EmojiPicker from './EmojiPicker';
import GifPicker from './GifPicker';
import Reactions from './Reactions';
import MessagePoll from './MessagePoll';
import CreatePollModal from './CreatePollModal';
import ComposerAddMenu from './ComposerAddMenu';
import type { ChatPoll } from './MessagePoll';
import { createPortal } from 'react-dom';
import UserAvatar from './UserAvatar';
import StickyPins from './StickyPins';
import UserBadges, { resolveServerTag } from './UserBadges';
// Модалка вложений открывается редко — грузим её чанк (и ~9 КБ стилей) только
// при первом открытии. Размонтировать её обратно нельзя: AnimatedOverlay внутри
// проигрывает анимацию закрытия, поэтому после первого показа компонент
// остаётся смонтированным, а видимостью управляет isOpen.
const AttachmentsModal = React.lazy(() => import('./AttachmentsModal'));
import { SmileIcon } from './Icons';
import ServerInviteCard from './ServerInviteCard';
import { extractInviteCodes, matchInviteCode, openInviteInApp } from '../utils/inviteLinks';
import { useAppearance } from '../contexts/AppearanceContext';

// Helper for inline markdown shared across components
const renderInlineMarkdown = (
  text: string, 
  customConfirm: (msg: string, title?: string, confirmText?: string, cancelText?: string) => Promise<boolean>,
  openLink: (url: string) => void
) => {
  if (!text) return null;
  
  // Split by markdown patterns: **bold**, *italic*, __underline__, `code`
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|__.*?__|`.*?`|https?:\/\/[^\s]+)/g);
  
  return parts.map((part, i) => {
    if (!part) return null;
    
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('__') && part.endsWith('__')) {
      return <u key={i}>{part.slice(2, -2)}</u>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="inline-code">{part.slice(1, -1)}</code>;
    }
    if (part.match(/^https?:\/\//)) {
      const inviteCode = matchInviteCode(part);
      // Ссылка-приглашение: внутри приложения открываем модалку-приглашение,
      // снаружи (в браузере) та же ссылка ведёт на страницу /invite/<code>.
      if (inviteCode) {
        return (
          <a
            key={i}
            href={part}
            className="message-link"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openInviteInApp(inviteCode);
            }}
          >
            {part}
          </a>
        );
      }
      return (
        <a
          key={i}
          href={part}
          className="message-link"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            customConfirm(
              `Вы собираетесь перейти на внешний ресурс: ${part}. Продолжить?`,
              'Внешняя ссылка',
              'Перейти',
              'Отмена'
            ).then((ok: boolean) => {
              if (ok) openLink(part);
            });
          }}
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

interface ChannelViewProps {
  channel: Channel;
  server: Server;
  messages: Message[];
  socket: Socket | null;
  onUserClick: (userId: string, event?: React.MouseEvent) => void;
  initialUnreadCount?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => Promise<void>;
  pinnedMessages?: Message[];
  setMessages?: React.Dispatch<React.SetStateAction<Message[]>>;
  onBack?: () => void;
  onToggleMembers?: () => void;
  showMembersSidebar?: boolean;
  isMobile?: boolean;
}

const MessageItem = React.memo<{
  msg: Message;
  prev: Message | undefined;
  user: User | null;
  server: Server;
  showPreview: boolean;
  showHoverBar: boolean;
  highlightMentions: boolean;
  canPin: boolean;
  canReact: boolean;
  onUserClick: (userId: string, event?: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, user: User, messageId?: string) => void;
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  formatDate: (d: string) => string;
  renderMessageContent: (c: string, m?: User[]) => any;
  handleDownload: (e: React.MouseEvent, url: string, filename: string) => void;
  setLightboxMedia: (m: any[]) => void;
  setLightboxIndex: (i: number) => void;
  setLightboxOpen: (o: boolean) => void;
  allMessages: Message[];
  onReact: (messageId: string, emoji: string) => void;
  onReply: (msg: Message) => void;
  scrollToMessage: (msgId: string, createdAt?: string) => void;
  onInteractiveButtonClick: (messageId: string, actionId: string) => void;
  isFresh?: boolean;
  // Индекс участников сервера — вместо линейного поиска по server.members
  // на каждое сообщение (см. utils/serverMembers).
  memberMap: Map<string, any>;
}>(({
  msg, prev, user, server, showPreview, showHoverBar, highlightMentions, canPin, canReact,
  onUserClick, onContextMenu, onTogglePin, onDelete, formatDate, renderMessageContent,
  handleDownload, setLightboxMedia, setLightboxIndex, setLightboxOpen, allMessages,
  onReact, onReply, scrollToMessage, onInteractiveButtonClick, isFresh, memberMap
}) => {
  const { confirm: customConfirm } = useDialog();
  const { interfaceScale } = useAppearance();

  const openLink = (url: string) => {
    if ((window as any).electron?.util?.openExternal) {
      (window as any).electron.util.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const renderEmbed = (embed: any, key: number) => {
    return (
      <div key={key} className="message-embed" style={{ borderLeftColor: embed.color || 'var(--primary-neon)' }}>
        <div className="embed-content-wrap">
          {embed.author && (
            <div className="embed-author">
              {embed.author.icon_url && (
                <img 
                  src={embed.author.icon_url} 
                  className="embed-author-icon" 
                  alt="" 
                  onError={(e) => (e.target as any).style.display = 'none'} 
                />
              )}
              {embed.author.url ? (
                <a
                  href={embed.author.url}
                  className="embed-author-name"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    customConfirm(
                      `Вы собираетесь перейти на внешний ресурс: ${embed.author.url}. Продолжить?`,
                      'Внешняя ссылка',
                      'Перейти',
                      'Отмена'
                    ).then((ok: boolean) => {
                      if (ok) openLink(embed.author.url);
                    });
                  }}
                >{renderInlineMarkdown(embed.author.name, customConfirm, openLink)}</a>
              ) : (
                <span className="embed-author-name">{renderInlineMarkdown(embed.author.name, customConfirm, openLink)}</span>
              )}
            </div>
          )}

          {embed.title && (
            embed.url ? (
              <a
                href={embed.url}
                className="embed-title"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  customConfirm(
                    `Вы собираетесь перейти на внешний ресурс: ${embed.url}. Продолжить?`,
                    'Внешняя ссылка',
                    'Перейти',
                    'Отмена'
                  ).then((ok: boolean) => {
                    if (ok) openLink(embed.url);
                  });
                }}
              >{renderInlineMarkdown(embed.title, customConfirm, openLink)}</a>
            ) : (
              <div className="embed-title">{renderInlineMarkdown(embed.title, customConfirm, openLink)}</div>
            )
          )}

          {embed.description && <div className="embed-description">{renderInlineMarkdown(embed.description, customConfirm, openLink)}</div>}

          {embed.fields && embed.fields.length > 0 && (
            <div className="embed-fields">
              {embed.fields.map((f: any, i: number) => (
                <div key={i} className="embed-field" style={{ gridColumn: f.inline ? 'auto' : '1 / -1' }}>
                  <div className="embed-field-name">{f.name}</div>
                  <div className="embed-field-value">{renderInlineMarkdown(f.value, customConfirm, openLink)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Progress bar special for music bot */}
          {(embed.footer?.text?.includes(' - ') || embed.footer?.text?.includes('00:00') || embed.footer?.text?.includes(' • ')) && (
             <div className="embed-progress-bar">
                <div className="progress-track-wrap">
                   <span>{(() => {
                      const parts = embed.footer?.text?.split(' • ');
                      if (parts.length > 1) {
                         const timeMatch = parts[1].match(/(\d+):(\d+)\s-\s(\d+):(\d+)/);
                         return timeMatch ? timeMatch[1] + ':' + timeMatch[2] : '0:00';
                      }
                      return '0:00';
                   })()}</span>
                   <div className="progress-track">
                      <div className="progress-fill" style={{ width: (() => {
                         const match = (embed.footer?.text || '').match(/(\d+):(\d+)\s-\s(\d+):(\d+)/);
                         if (!match) return '0%';
                         const cur = parseInt(match[1]) * 60 + parseInt(match[2]);
                         const total = parseInt(match[3]) * 60 + parseInt(match[4]);
                         return total > 0 ? `${Math.min(100, (cur / total) * 100)}%` : '0%';
                      })() }} />
                   </div>
                   <span>{(() => {
                      const match = (embed.footer?.text || '').match(/(\d+):(\d+)\s-\s(\d+):(\d+)/);
                      return match ? match[3] + ':' + match[4] : '';
                   })()}</span>
                </div>
             </div>
          )}

          {embed.image && embed.image.url && (
            <img 
              src={embed.image.url} 
              className="embed-image" 
              alt="" 
              onError={(e) => (e.target as any).style.display = 'none'}
              onClick={() => {
                setLightboxMedia([{ url: embed.image.url, type: 'image/png' }]);
                setLightboxIndex(0);
                setLightboxOpen(true);
              }} 
            />
          )}

          {embed.footer && (
            <div className="embed-footer">
              {embed.footer.icon_url && <img src={embed.footer.icon_url} className="embed-footer-icon" alt="" />}
              <span className="embed-footer-text">{embed.footer.text}</span>
            </div>
          )}
        </div>
        {embed.thumbnail && embed.thumbnail.url && (
          <img src={embed.thumbnail.url} className="embed-thumbnail" alt="" />
        )}
      </div>
    );
  };


  const renderButtons = () => {
    if (!msg.buttons || msg.buttons.length === 0) return null;

    // Group buttons by row
    const rows: { [key: number]: any[] } = {};
    msg.buttons.forEach(btn => {
      const r = btn.row || 0;
      if (!rows[r]) rows[r] = [];
      rows[r].push(btn);
    });

    const rowKeys = Object.keys(rows).map(Number).sort((a, b) => a - b);

    return (
      <div className="message-interactive-buttons">
        {rowKeys.map(rk => (
          <div key={rk} className="button-row">
            {rows[rk].map((btn, i) => (
              btn.actionId ? (
                <button
                  key={i}
                  onClick={() => onInteractiveButtonClick(msg._id, btn.actionId!)}
                  className={`msg-button ${btn.style || 'primary'}`}
                >
                  {btn.label}
                </button>
              ) : (
                <a key={i} href={btn.url} target="_blank" rel="noopener noreferrer" className={`msg-button ${btn.style || 'primary'}`}>
                  {btn.label}
                </a>
              )
            ))}
          </div>
        ))}
      </div>
    );
  };
  const [showEmojiPicker, setShowEmojiPicker] = useState<{ x: number, y: number, msgId: string } | null>(null);

  const shouldShowDate = (current: Message, previous: Message | undefined) => {
    if (!previous) return true;
    return new Date(current.createdAt).getDate() !== new Date(previous.createdAt).getDate();
  };

  const isGrouped = (current: Message, previous: Message | undefined) => {
    if (!previous) return false;
    if (previous.type === 'server-join') return false;
    if (current.author._id !== previous.author._id) return false;
    if (shouldShowDate(current, previous)) return false;
    const timeDiff = new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime();
    return timeDiff < 5 * 60 * 1000;
  };

  const showDate = shouldShowDate(msg, prev);
  const grouped = isGrouped(msg, prev);

  // Системное сообщение (напр. вход на сервер) — не оформляется как обычное сообщение от автора.
  if (msg.type === 'server-join') {
    const member = memberMap.get(String(msg.author._id));
    const displayName = member?.nickname || msg.author.displayName || msg.author.username;
    
    const mentionElement = (
      <span
        key="join-mention"
        className="mention-tag user-mention"
        style={{ cursor: server.showMembersList !== false ? 'pointer' : 'default' }}
        onClick={(e) => {
          if (server.showMembersList !== false) {
            e.stopPropagation();
            onUserClick(msg.author._id, e);
          }
        }}
      >
        @{displayName}
      </span>
    );

    const rawAuthorName = msg.author.displayName || msg.author.username;
    const searchNames = [displayName, rawAuthorName].filter(Boolean);

    let renderedContent: React.ReactNode = msg.content;
    let replaced = false;

    for (const nameToSearch of searchNames) {
      if (nameToSearch && msg.content.includes(nameToSearch)) {
        const parts = msg.content.split(nameToSearch);
        const elements: React.ReactNode[] = [];
        parts.forEach((part, idx) => {
          elements.push(part);
          if (idx < parts.length - 1) {
            elements.push(mentionElement);
          }
        });
        renderedContent = elements;
        replaced = true;
        break;
      }
    }

    if (!replaced) {
      renderedContent = <>{mentionElement} {msg.content}</>;
    }
    
    return (
      <>
        {showDate && <div className="message-date-divider"><span>{formatDate(msg.createdAt)}</span></div>}
        <div className="system-message" id={`msg-${msg._id}`}>
          <div className="system-message-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
          <span className="system-message-text">{renderedContent}</span>
          <span className="system-message-time">{formatClockTime(msg.createdAt)}</span>
        </div>
      </>
    );
  }

  const member = memberMap.get(String(msg.author._id));

  // Only animate genuinely new (incoming) messages; historical batches and
  // pagination loads render with no entrance animation to keep the chat snappy.
  const messageProps = isFresh ? {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.75 },
  } : {};
  const MessageBox: any = isFresh ? motion.div : 'div';

  return (
    <React.Fragment>
      {showDate && <div className="message-date-divider"><span>{formatDate(msg.createdAt)}</span></div>}
      <MessageBox
        id={`msg-${msg._id}`}
        className={`message ${grouped ? 'grouped' : 'with-author'} ${highlightMentions && msg.mentions?.some(m => m._id === user?._id) ? 'mention-highlight' : ''} ${msg.replyTo ? 'has-reply' : ''}`}
        onContextMenu={(e: React.MouseEvent) => onContextMenu(e, msg.author, msg._id)}
        {...messageProps}
      >
        {msg.replyTo && (() => {
          const replyMember = memberMap.get(String(msg.replyTo!.author._id));
          return (
            <div className="message-reply-preview" onClick={() => scrollToMessage(msg.replyTo!._id, msg.replyTo!.createdAt)}>
              <div className="reply-line" />
              <ReplyIcon size={12} className="reply-icon-mini" />
              <UserAvatar user={msg.replyTo.author} avatarOverride={replyMember?.avatar || undefined} size={16 * interfaceScale} className="reply-avatar" />
              <span className="reply-author">{replyMember?.nickname || msg.replyTo.author.displayName || msg.replyTo.author.username}</span>
              <UserBadges badges={msg.replyTo.author.badges} serverTag={resolveServerTag(msg.replyTo.author)} size={10 * interfaceScale} />
              <span className="reply-content">{msg.replyTo.content || (msg.replyTo.attachments?.length ? 'Вложение' : '')}</span>
            </div>
          );
        })()}
        {!grouped && (
          <div className="message-author-avatar-wrap">
            <UserAvatar
              user={msg.author}
              avatarOverride={member?.avatar || undefined}
              size={42 * interfaceScale}
              className="message-author-avatar"
              onClick={(e) => { if (server.showMembersList !== false) onUserClick(msg.author._id, e); }}
              onContextMenu={(e) => onContextMenu(e, msg.author)}
            />
          </div>
        )}
        {grouped && <div className="message-time-mini">{formatClockTime(msg.createdAt)}</div>}

        <div className="message-content">
          <div className="message-header">
            {!grouped && (
              <div className="message-author-info">
                <span
                  className="message-author"
                  onClick={(e) => { if (server.showMembersList !== false) onUserClick(msg.author._id, e); }}
                  onContextMenu={(e) => onContextMenu(e, msg.author)}
                  style={{
                    cursor: server.showMembersList !== false ? 'pointer' : 'default',
                    color: (() => {
                      if (!member) return 'inherit';
                      const roleIds = member.roles || [];
                      const roles = (server.roles || []).filter(r => roleIds.includes(r._id));
                      roles.sort((a, b) => (b.position || 0) - (a.position || 0));
                      const colorRole = roles.find(r => r.color && r.color !== '#99AAB5' && r.color !== '#99aab5');
                      return colorRole ? colorRole.color : 'inherit';
                    })()
                  }}
                >
                  {member?.nickname || msg.author.displayName || msg.author.username}
                </span>
                <UserBadges badges={msg.author.badges} serverTag={resolveServerTag(msg.author)} size={14 * interfaceScale} />
                {msg.author.isBot && <span className="bot-badge">БOТ</span>}
                <span className="message-time">{formatDate(msg.createdAt)}</span>
              </div>
            )}

            {showHoverBar && (
              <div className={`message-actions-hover ${grouped ? 'mini' : ''}`}>
                {canPin && (
                  <button
                    className={`msg-action-btn ${grouped ? 'mini' : ''}`}
                    onClick={() => onTogglePin(msg._id)}
                    title={msg.pinned ? "Открепить" : "Закрепить"}
                  >
                    <PinIcon size={grouped ? 14 : 16} fill={msg.pinned ? "var(--primary-neon)" : "none"} color={msg.pinned ? "var(--primary-neon)" : "currentColor"} />
                  </button>
                )}
                {canReact && (
                  <button
                    className={`msg-action-btn ${grouped ? 'mini' : ''}`}
                    onClick={(e) => setShowEmojiPicker({ x: e.clientX, y: e.clientY, msgId: msg._id })}
                    title="Добавить реакцию"
                  >
                    <SmileIcon size={grouped ? 14 : 16} />
                  </button>
                )}
                <button
                  className={`msg-action-btn ${grouped ? 'mini' : ''}`}
                  onClick={() => onReply(msg)}
                  title="Ответить"
                >
                  <ReplyIcon size={grouped ? 14 : 16} />
                </button>
                <button
                  className={`msg-action-btn ${grouped ? 'mini' : ''}`}
                  onClick={() => {
                    const text = msg.content;
                    if ((window as any).electron?.clipboard) {
                      (window as any).electron.clipboard.writeText(text);
                    } else {
                      navigator.clipboard.writeText(text).catch(err => {
                        console.error('Failed to copy: ', err);
                      });
                    }
                  }}
                  title="Копировать текст"
                >
                  <CopyIcon size={grouped ? 14 : 16} />
                </button>
                <button
                  className={`msg-action-btn ${grouped ? 'mini' : ''}`}
                  onClick={() => window.dispatchEvent(new CustomEvent('open-forward', { detail: { message: msg } }))}
                  title="Переслать"
                >
                  <ForwardIcon size={grouped ? 14 : 16} />
                </button>
                {(msg.author._id === user?._id || (typeof server.owner === 'object' ? (server.owner as any)._id : server.owner) === user?._id) && (
                  <button className={`msg-action-btn danger ${grouped ? 'mini' : ''}`} onClick={() => onDelete(msg._id)}>
                    <TrashIcon size={grouped ? 14 : 16} />
                  </button>
                )}
              </div>
            )}
          </div>

          {msg.pinned && !grouped && <div className="pinned-indicator"><PinIcon size={12} fill="var(--primary-neon)" color="var(--primary-neon)" /> Закреплено</div>}

          {msg.forwardedFrom && (
            <div className="forwarded-label">
              <ForwardIcon size={13} />
              <span>Переслано от <b>{msg.forwardedFrom.authorUsername || 'пользователя'}</b></span>
            </div>
          )}

          <div className="message-text">{renderMessageContent(msg.content, msg.mentions)}</div>

          {extractInviteCodes(msg.content).map((code) => (
            <ServerInviteCard key={code} code={code} />
          ))}

          {showPreview && msg.attachments && msg.attachments.length > 0 && (
            <div className="message-attachments">
              {msg.attachments.map((att, i) => (
                <div key={i} className="attachment-item">
                  {att.type.startsWith('image/') ? (
                    <div className="attachment-image-container">
                      <img src={getFullUrl(att.url)!} alt="" className="attachment-image" onClick={() => {
                        const allMedia = allMessages.flatMap((m: any) => m.attachments || []).filter((a: any) => a.type.startsWith('image/') || a.type.startsWith('video/'));
                        setLightboxMedia(allMedia);
                        setLightboxIndex(allMedia.findIndex((a: any) => a.url === att.url));
                        setLightboxOpen(true);
                      }} />
                      <button onClick={(e) => handleDownload(e, getFullUrl(att.url)!, att.filename)} className="attachment-download-btn" title="Скачать">
                        <DownloadIcon size={16} />
                      </button>
                    </div>
                  ) : att.type.startsWith('video/') ? (
                    <div className="attachment-video-wrapper" style={{ width: '100%', maxWidth: '500px' }}>
                      <CustomVideoPlayer src={getFullUrl(att.url)!} onExpand={(currentTime) => {
                        const allMedia = allMessages.flatMap((m: any) => m.attachments || []).filter((a: any) => a.type.startsWith('image/') || a.type.startsWith('video/')).map((a: any) => ({ ...a }));
                        const idx = allMedia.findIndex((a: any) => a.url === att.url);
                        if (idx !== -1) (allMedia[idx] as any).startTime = currentTime;
                        setLightboxMedia(allMedia);
                        setLightboxIndex(idx);
                        setLightboxOpen(true);
                      }} />
                      <button onClick={(e) => handleDownload(e, getFullUrl(att.url)!, att.filename)} className="attachment-download-btn video" title="Скачать">
                        <DownloadIcon size={16} />
                      </button>
                    </div>
                  ) : (att.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(att.filename || '')) ? (
                    <div className="attachment-audio-container">
                      <CustomAudioPlayer src={getFullUrl(att.url)!} filename={att.filename} />
                      <button onClick={(e) => handleDownload(e, getFullUrl(att.url)!, att.filename)} className="attachment-download-btn audio" title="Скачать">
                        <DownloadIcon size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="attachment-file-container">
                      <a href={getFullUrl(att.url)!} target="_blank" rel="noopener noreferrer" className="attachment-file">
                        <DocumentIcon size={18} /><span>{att.filename}</span>
                      </a>
                      <button onClick={(e) => handleDownload(e, getFullUrl(att.url)!, att.filename)} className="attachment-download-btn file" title="Скачать">
                        <DownloadIcon size={16} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {showPreview && msg.embeds && msg.embeds.length > 0 && (
            <div className="message-embeds">
              {msg.embeds.map((emb, i) => renderEmbed(emb, i))}
            </div>
          )}

          {renderButtons()}

          {msg.poll && <MessagePoll messageId={msg._id} poll={msg.poll as any} currentUserId={user?._id} />}

          {msg.edited && <span className="message-edited">(изменено)</span>}

          <Reactions
            reactions={msg.reactions || []}
            currentUserId={user?._id || ''}
            onReact={(emoji) => onReact(msg._id, emoji)}
          />
        </div>
      </MessageBox>

      {showEmojiPicker && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
          onClick={() => setShowEmojiPicker(null)}
        >
          <div
            style={{
              position: 'fixed',
              top: Math.min(showEmojiPicker.y, window.innerHeight - 420),
              left: Math.min(showEmojiPicker.x, window.innerWidth - 340),
              zIndex: 10000
            }}
            onClick={e => e.stopPropagation()}
          >
            <EmojiPicker
              server={server}
              onSelect={(emoji) => {
                onReact(msg._id, emoji);
                setShowEmojiPicker(null);
              }}
            />
          </div>
        </div>,
        document.body
      )}
    </React.Fragment>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.msg === nextProps.msg &&
    prevProps.prev?._id === nextProps.prev?._id &&
    prevProps.isFresh === nextProps.isFresh &&
    prevProps.showPreview === nextProps.showPreview &&
    prevProps.showHoverBar === nextProps.showHoverBar &&
    prevProps.highlightMentions === nextProps.highlightMentions &&
    prevProps.canPin === nextProps.canPin &&
    prevProps.canReact === nextProps.canReact &&
    prevProps.user?._id === nextProps.user?._id
  );
});

const ChannelView: React.FC<ChannelViewProps> = ({
  channel, server, messages, socket, onUserClick, initialUnreadCount = 0,
  hasMore = false, isLoadingMore = false, onLoadMore, pinnedMessages = [], setMessages,
  onBack, onToggleMembers, showMembersSidebar = true, isMobile
}) => {
  const { user } = useAuth();
  const { confirm: customConfirm, alert } = useDialog();
  const { interfaceScale } = useAppearance();

  const openLink = useCallback((url: string) => {
    if ((window as any).electron?.util?.openExternal) {
      (window as any).electron.util.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);
  const {
    showPreview,
    showHoverBar,
    highlightMentions,
    emojiAutocomplete,
    textToSpeech,
    sendHotkey
  } = useChatSettings();
  // Индекс участников: строится один раз на изменение состава сервера и
  // используется вместо линейного поиска в рендере списка сообщений.
  const memberMap = useServerMemberMap(server);
  const [message, setMessage] = useState('');
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachmentsEverOpened, setAttachmentsEverOpened] = useState(false);
  useEffect(() => { if (showAttachments) setAttachmentsEverOpened(true); }, [showAttachments]);
  const [showGifPicker, setShowGifPicker] = useState<{ x: number, y: number } | null>(null);
  const [showPollModal, setShowPollModal] = useState(false);

  // Track which message id was last in the list at the previous render. Anything
  // appearing AFTER that index this render counts as a fresh incoming message and
  // gets the spring entrance animation. Pagination/history loads (prepended) and
  // the initial mount don't trigger the animation.
  const lastSeenIdRef = useRef<string | null>(null);
  const prevLastSeenId = lastSeenIdRef.current;
  const lastSeenIdx = prevLastSeenId
    ? messages.findIndex(m => m._id === prevLastSeenId)
    : -1;
  const hasBaseline = prevLastSeenId !== null && lastSeenIdx !== -1;
  useEffect(() => {
    if (messages.length > 0) lastSeenIdRef.current = messages[messages.length - 1]._id;
  }, [messages]);

  const userPermissions = useMemo(() => {
    if (!user) return 0n;
    return computePermissions(user._id, server, channel);
  }, [user, server, channel]);

  const canPin = hasPermission(userPermissions, Permissions.PIN_MESSAGES);
  const canReact = hasPermission(userPermissions, Permissions.ADD_REACTIONS);
  const canMentionEveryone = hasPermission(userPermissions, Permissions.MENTION_EVERYONE);

  // Мут на сервере / Охлаждение новоприбывших — заменяем поле ввода баннером-предупреждением, пока он не истёк.
  const [now, setNow] = useState(() => Date.now());

  const { effectiveMuteUntil, isMuted, isMutePermanent, isNewcomerCooldownActive } = useMemo(() => {
    if (!user || !server) return { effectiveMuteUntil: null, isMuted: false, isMutePermanent: false, isNewcomerCooldownActive: false };

    const userIdStr = String(user._id);
    const ownerIdStr = String(typeof server.owner === 'object' && server.owner ? (server.owner as any)._id : server.owner);
    if (ownerIdStr === userIdStr) return { effectiveMuteUntil: null, isMuted: false, isMutePermanent: false, isNewcomerCooldownActive: false };

    const member = (server.members || []).find(m => String(typeof m.user === 'object' && m.user ? (m.user as any)._id : m.user) === userIdStr);
    if (!member) return { effectiveMuteUntil: null, isMuted: false, isMutePermanent: false, isNewcomerCooldownActive: false };

    let regularMuteUntil: Date | null = null;
    if (member.communicationDisabledUntil) {
      const until = new Date(member.communicationDisabledUntil);
      if (until.getTime() > now) {
        regularMuteUntil = until;
      }
    }

    let newcomerCooldownUntil: Date | null = null;
    const cooldownSec = server.newcomerCooldownSeconds || 0;
    if (cooldownSec > 0 && member.joinedAt) {
      const joinedMs = new Date(member.joinedAt).getTime();
      const cooldownEndMs = joinedMs + cooldownSec * 1000;
      if (cooldownEndMs > now) {
        newcomerCooldownUntil = new Date(cooldownEndMs);
      }
    }

    const isNewcomer = !regularMuteUntil && !!newcomerCooldownUntil;
    const effective = regularMuteUntil || newcomerCooldownUntil;
    const muted = !!effective && effective.getTime() > now;
    const perm = !isNewcomer && muted && (effective!.getTime() - now > 50 * 365 * 24 * 60 * 60 * 1000);

    return {
      effectiveMuteUntil: effective,
      isMuted: muted,
      isMutePermanent: perm,
      isNewcomerCooldownActive: isNewcomer
    };
  }, [server, user, now]);

  useEffect(() => {
    if (!isMuted || !effectiveMuteUntil) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [isMuted, effectiveMuteUntil]);

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, user: User, messageId?: string } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxMedia, setLightboxMedia] = useState<any[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const unreadRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasScrolledToNew, setHasScrolledToNew] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [autocompleteType, setAutocompleteType] = useState<'mention' | 'channel' | 'emoji'>('mention');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showPins, setShowPins] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const lastScrollTopRef = useRef(0);

  const chatEngineRef = useRef<ChatScrollEngineHandle>(null);
  const atBottomRef = useRef(true);
  const justSentRef = useRef(false);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    atBottomRef.current = atBottom;
    setShowScrollBottom(!atBottom);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    chatEngineRef.current?.scrollToBottom(smooth);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, user: User, messageId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, user, messageId });
  }, []);

  const handleMention = (username: string) => {
    setMessage((prev) => `${prev}@${username} `);
  };

  // Упоминание из списка участников (ServerMembers диспатчит событие, т.к. не имеет
  // доступа к полю ввода) — добавляем @ник в текущее сообщение.
  useEffect(() => {
    const onMentionUser = (e: any) => {
      const username = e?.detail?.username;
      if (username) setMessage((prev) => `${prev}@${username} `);
    };
    window.addEventListener('zvon-mention-user', onMentionUser);
    return () => window.removeEventListener('zvon-mention-user', onMentionUser);
  }, []);

  const pendingJumpIdRef = useRef<string | null>(null);

  const jumpToMessage = async (messageId: string, createdAt: string) => {
    setShowSearch(false);
    pendingJumpIdRef.current = messageId;
    let currentList = messages;
    const isTargetLoaded = () => currentList.some(m => m._id === messageId);

    if (!isTargetLoaded() && setMessages) {
      try {
        let fetched: Message[] = [...currentList];
        let attempts = 0;
        const maxAttempts = 15;

        while (!fetched.some(m => m._id === messageId) && attempts < maxAttempts) {
          attempts++;
          const oldestMsg = fetched[0];
          const beforeParam = oldestMsg ? oldestMsg.createdAt : new Date(new Date(createdAt).getTime() + 1000).toISOString();
          const res = await axios.get(`/api/messages/channel/${channel._id}`, { params: { before: beforeParam, limit: 50 } });
          const newBatch: Message[] = res.data;
          if (!newBatch || newBatch.length === 0) break;

          const seen = new Set(fetched.map(m => m._id));
          const toAdd = newBatch.filter(m => !seen.has(m._id));
          if (toAdd.length === 0) break;

          fetched = [...toAdd, ...fetched];
          fetched.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        }

        setMessages(fetched);
      } catch (e) {
        pendingJumpIdRef.current = null;
        return;
      }
    } else {
      chatEngineRef.current?.scrollToMessage(messageId);
      pendingJumpIdRef.current = null;
    }
  };

  useEffect(() => {
    if (!pendingJumpIdRef.current) return;
    const msgId = pendingJumpIdRef.current;
    
    // Give React time to layout new elements
    const timer = setTimeout(() => {
      const el = document.getElementById(`msg-${msgId}`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('highlight-flash');
        setTimeout(() => el.classList.remove('highlight-flash'), 2000);
        pendingJumpIdRef.current = null;
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [messages]);

  const handleTogglePin = useCallback((messageId: string) => {
    axios.patch(`/api/messages/${messageId}/pin`);
  }, []);

  const scrollToMessage = useCallback(async (msgId: string, createdAt?: string) => {
    if (!msgId) return;
    const isLoaded = messages.some((m) => m._id === msgId);
    if (isLoaded) {
      chatEngineRef.current?.scrollToMessage(msgId);
      return;
    }
    if (createdAt) {
      await jumpToMessage(msgId, createdAt);
    }
  }, [messages, jumpToMessage]);

  useEffect(() => {
    if (!socket) return;
    const handleTyping = (data: { userId: string; channelId: string }) => {
      if (data.channelId === channel._id && data.userId !== user?._id) {
        setTypingUsers((prev) => new Set(prev).add(data.userId));
      }
    };
    const handleStoppedTyping = (data: { userId: string; channelId: string }) => {
      if (data.channelId === channel._id) {
        setTypingUsers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(data.userId);
          return newSet;
        });
      }
    };
    socket.on('user-typing', handleTyping);
    socket.on('user-stopped-typing', handleStoppedTyping);

    const handleMessageUpdated = (updatedMsg: Message) => {
      if (setMessages) {
        setMessages(prev => prev.map(m => m._id === updatedMsg._id ? updatedMsg : m));
      }
    };
    socket.on('message-updated', handleMessageUpdated);

    const handleReactionsUpdate = (data: { messageId: string, reactions: any[] }) => {
      if (setMessages) {
        setMessages(prev => prev.map(m => m._id === data.messageId ? { ...m, reactions: data.reactions } : m));
      }
    };
    socket.on('message-reactions-update', handleReactionsUpdate);

    const handlePollUpdate = (data: { messageId: string, poll: any }) => {
      if (setMessages) {
        setMessages(prev => prev.map(m => m._id === data.messageId ? { ...m, poll: data.poll } : m));
      }
    };
    socket.on('message-poll-update', handlePollUpdate);

    const handleScrollChat = (e: any) => {
      const { direction } = e.detail;
      chatEngineRef.current?.scrollBy({ top: direction === 'up' ? -300 : 300, behavior: 'smooth' });
    };

    const handleEditLast = () => {
      const myLastMsg = [...messages].reverse().find(m => m.author._id === user?._id);
      if (myLastMsg) {
        // Implementation for editing would require changing state of MessageItem or using a global edit state
        // For now, let's at least scroll to it and focus input with its content as a simple "start over" or use a custom event
        window.dispatchEvent(new CustomEvent('zvon-edit-message', { detail: { message: myLastMsg } }));
      }
    };

    const handleDeleteLast = async () => {
      const myLastMsg = [...messages].reverse().find(m => m.author._id === user?._id);
      if (myLastMsg && await customConfirm('Удалить ваше последнее сообщение?')) {
        socket.emit('delete-message', { messageId: myLastMsg._id, channelId: channel._id });
      }
    };

    window.addEventListener('zvon-scroll-chat', handleScrollChat);
    window.addEventListener('zvon-edit-last-message', handleEditLast);
    window.addEventListener('zvon-delete-last-message', handleDeleteLast);

    return () => {
      socket.off('user-typing', handleTyping);
      socket.off('user-stopped-typing', handleStoppedTyping);
      socket.off('message-updated', handleMessageUpdated);
      socket.off('message-reactions-update', handleReactionsUpdate);
      socket.off('message-poll-update', handlePollUpdate);
      window.removeEventListener('zvon-scroll-chat', handleScrollChat);
      window.removeEventListener('zvon-edit-last-message', handleEditLast);
      window.removeEventListener('zvon-delete-last-message', handleDeleteLast);
    };
  }, [socket, channel._id, user?._id, setMessages, messages]);


  const handleReact = useCallback((messageId: string, emoji: string) => {
    axios.post(`/api/messages/${messageId}/reactions`, { emoji });
  }, []);

  const handleReply = useCallback((m: Message) => {
    setReplyToMessage(m);
    inputRef.current?.focus();
  }, []);

  const handleInteractiveButtonClick = useCallback((messageId: string, actionId: string) => {
    socket?.emit('interactive-button-click', { messageId, actionId, channelId: channel._id });
  }, [socket, channel._id]);

  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<{ id: string; name: string; previewUrl: string | null }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Общая загрузка файлов для composer'а (клик по "+", вставка из буфера, drag&drop) —
  // показывает индикатор загрузки на месте будущего вложения, пока идёт запрос.
  const uploadComposerFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const pending = files.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    }));
    setUploadingFiles(prev => [...prev, ...pending]);
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    try {
      const response = await axios.post('/api/upload-files', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setAttachments(prev => [...prev, ...response.data]);
    } catch (error) {
      await alert('Ошибка загрузки файла');
    } finally {
      pending.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
      setUploadingFiles(prev => prev.filter(p => !pending.some(pp => pp.id === p.id)));
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && attachments.length === 0) || !socket) return;
    chatEngineRef.current?.setJustSent();
    socket.emit('send-message', {
      content: message.trim(),
      channelId: channel._id,
      attachments,
      replyToId: replyToMessage?._id
    });
    setMessage('');
    setAttachments([]);
    setReplyToMessage(null);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing-stop', { channelId: channel._id });
  };

  const handleCreatePoll = (poll: ChatPoll) => {
    if (!socket) return;
    chatEngineRef.current?.setJustSent();
    socket.emit('send-message', {
      content: '',
      channelId: channel._id,
      poll,
      replyToId: replyToMessage?._id
    });
    setShowPollModal(false);
    setReplyToMessage(null);
  };

  const handleGifSelect = (url: string) => {
    if (!socket) return;
    const attachment = { url, filename: 'tenor.gif', type: 'image/gif', size: 0 };
    chatEngineRef.current?.setJustSent();
    socket.emit('send-message', {
      content: '',
      channelId: channel._id,
      attachments: [attachment],
      replyToId: replyToMessage?._id
    });
    setShowGifPicker(null);
    setReplyToMessage(null);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing-stop', { channelId: channel._id });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadComposerFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      // Allow default paste if it's just text, prevent default if it's a file to avoid text pasting of filename
      const items = Array.from(e.clipboardData.items);
      const isFile = items.some(item => item.kind === 'file');

      if (isFile) {
        e.preventDefault();
        await uploadComposerFiles(Array.from(e.clipboardData.files));
      }
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);

    const cursorPosition = e.target.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAtSignIndex = textBeforeCursor.lastIndexOf('@');
    const lastHashSignIndex = textBeforeCursor.lastIndexOf('#');
    const lastColonSignIndex = textBeforeCursor.lastIndexOf(':');

    // Find which trigger is closest to the cursor before cursor position
    const triggers = [
      { type: 'mention' as const, index: lastAtSignIndex },
      { type: 'channel' as const, index: lastHashSignIndex },
      { type: 'emoji' as const, index: lastColonSignIndex }
    ].filter(t => t.index !== -1).sort((a, b) => b.index - a.index);

    const activeTrigger = triggers[0];

    if (activeTrigger && emojiAutocomplete) {
      const query = textBeforeCursor.substring(activeTrigger.index + 1);
      // Valid query: no spaces between trigger and cursor
      if (!query.includes(' ') && !query.includes('\n')) {
        setAutocompleteType(activeTrigger.type);
        setShowMentions(true);
        setMentionQuery(query);
        setMentionStartIndex(activeTrigger.index);
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }

    if (!socket) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing-start', { channelId: channel._id });
    typingTimeoutRef.current = setTimeout(() => { socket.emit('typing-stop', { channelId: channel._id }); }, 3000);
  };

  const handleMentionSelect = (item: any) => {
    const before = message.substring(0, mentionStartIndex);
    const after = message.substring(mentionStartIndex + mentionQuery.length + 1);
    let insertText = '';

    if (autocompleteType === 'channel') {
      insertText = `#${item.name}`;
    } else if (autocompleteType === 'emoji') {
      insertText = `:${item.name}:`;
    } else {
      const isUser = 'username' in item;
      const name = isUser ? item.username : item.name;
      insertText = `@${name}`;
    }

    const newMessage = `${before}${insertText} ${after}`;
    setMessage(newMessage);
    setShowMentions(false);

    // Return focus to input
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const renderMessageContent = useCallback((content: string, mentions: User[] = []) => {
    const parts = content.split(/(@\w+|#[\w-]+|:\w+:|```[\s\S]*?```)/g);

    return (
      <>
        {parts.map((part, i) => {
          if (!part) return null;

          if (typeof part !== 'string') return null;

          if (part.startsWith('```') && part.endsWith('```')) {
            const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
            if (match) {
              const lang = match[1] || 'text';
              const code = match[2];
              return (
                <div
                  key={`code-${i}`}
                  className="code-block-wrapper"
                  onClick={e => e.stopPropagation()}
                  style={{
                    margin: '8px 0',
                    borderRadius: '6px',
                    background: '#1e1e1e',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '12px',
                    overflowX: 'auto',
                    fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
                    fontSize: '13px',
                    color: '#d4d4d4'
                  }}
                >
                  {lang && <div style={{ color: '#569cd6', marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase', userSelect: 'none' }}>{lang}</div>}
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    <code>{code.replace(/^\n/, '').replace(/\n$/, '')}</code>
                  </pre>
                </div>
              );
            }
          }

          if (part.startsWith('#')) {
            const channelName = part.substring(1);
            const targetChannel = server.channels?.find(c => c.name === channelName);

            if (targetChannel) {
              return (
                <span
                  key={`channel-mention-${i}`}
                  className="mention-tag channel-mention"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('select-server', {
                      detail: { serverId: server._id, channelId: targetChannel._id }
                    }));
                  }}
                >
                  #{channelName}
                </span>
              );
            }
          }

          if (part.startsWith(':') && part.endsWith(':')) {
            const emojiName = part.slice(1, -1);
            const serverEmoji = server.emojis?.find(e => e.name === emojiName);

            if (serverEmoji) {
              return (
                <img
                  key={`emoji-${i}`}
                  src={getFullUrl(serverEmoji.url) || serverEmoji.url}
                  alt={part}
                  title={`:${emojiName}:`}
                  style={{
                    width: '1.3em',
                    height: '1.3em',
                    verticalAlign: 'middle',
                    objectFit: 'contain',
                    display: 'inline-block',
                    margin: '0 2px'
                  }}
                />
              );
            }
          }

          if (part.startsWith('@')) {
            const name = part.substring(1);
            const userMentionByName = mentions.find(m => m.username === name);
            const role = server.roles?.find(r => r.name === name);
            const isSpecialMention = name === 'everyone' || name === 'here';

            // Find mention by order/index if username changed
            const userMentionIndex = userMentionByName ? -1 : mentions.findIndex((m, idx) => {
              const prevUserMentions = parts.slice(0, i).filter(p => p.startsWith('@') && !server.roles?.some(r => r.name === p.substring(1)) && p.substring(1) !== 'everyone' && p.substring(1) !== 'here');
              return prevUserMentions.length === idx;
            });
            const userMention = userMentionByName || (userMentionIndex !== -1 ? mentions[userMentionIndex] : undefined);
            const isUserMention = !!userMention;

            if (isUserMention || role || isSpecialMention) {
              const color = role ? role.color : (isSpecialMention ? 'var(--primary-neon)' : 'inherit');

              return (
                <span
                  key={`mention-${i}`}
                  className={`mention-tag ${role ? 'role-mention' : (isSpecialMention ? 'special-mention' : 'user-mention')}`}
                  style={color !== 'inherit' ? { color: color } : {}}
                  onClick={(e) => {
                    if (userMention) {
                      e.stopPropagation();
                      onUserClick(userMention._id, e);
                    }
                  }}
                >
                  {part}
                </span>
              );
            }
          }

          return (
            <span key={`text-${i}`} style={{ whiteSpace: 'pre-wrap' }}>
              {renderInlineMarkdown(part, customConfirm, openLink)}
            </span>
          );
        })}
      </>
    );
  }, [server, onUserClick, customConfirm, openLink]);


  const removeAttachment = (index: number) => setAttachments(prev => prev.filter((_, i) => i !== index));

  const handleDownload = useCallback(async (e: React.MouseEvent, url: string, filename: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const response = await fetch(url, { mode: 'cors' });
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.warn('Fetch download failed, falling back to direct link:', error);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = "_blank";
      link.click();
    }
  }, []);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadComposerFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (await customConfirm('Удалить это сообщение?')) {
      socket?.emit('delete-message', { messageId, channelId: channel._id });
    }
  }, [customConfirm, socket, channel._id]);

  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return formatClockTime(date);
    if (days === 1) return 'Вчера';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }, []);

  return (
    <div
      className={`channel-view panel-hero ${isDragging ? 'dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="panel-hero-bg" aria-hidden="true">
        <div className="blob cyan" />
        <div className="blob purple" />
        <div className="blob pink" />
      </div>
      {isDragging && (
        <div className="drag-drop-overlay">
          <div className="drag-drop-content">
            <div className="drag-drop-icon"><PlusIcon size={48 * interfaceScale} /></div>
            <div className="drag-drop-text">Перетащите файлы сюда для загрузки</div>
          </div>
        </div>
      )}
      <div className="channel-header">
        {isMobile && onBack && (
          <button className="mobile-close-btn" onClick={onBack}>
            <svg width={24 * interfaceScale} height={24 * interfaceScale} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </button>
        )}
        <div className="channel-header-info" onClick={() => setShowAttachments(true)} style={{ cursor: 'pointer' }}>
          <span className="channel-icon"><HashtagIcon size={24 * interfaceScale} color="#8e9297" /></span>
          <h3>{channel.name}</h3>
        </div>
        {channel.topic && !isMobile && <div className="channel-topic">{channel.topic}</div>}
        <div style={{ flex: 1 }} />
        <button
          className="header-action-btn"
          onClick={() => setShowSearch(s => !s)}
          title="Поиск по сообщениям"
        >
          <SearchIcon size={20 * interfaceScale} color={showSearch ? "var(--primary-neon)" : "var(--text-dim)"} />
        </button>
        <button
          className="header-action-btn"
          onClick={() => setShowPins(!showPins)}
          title="Закрепленные сообщения"
        >
          <PinIcon size={20 * interfaceScale} fill={showPins ? "var(--primary-neon)" : "none"} color={showPins ? "var(--primary-neon)" : "var(--text-dim)"} />
        </button>
        {server.showMembersList !== false && onToggleMembers && (
          <button
            className={`voice-chat-toggle-btn ${showMembersSidebar ? 'active' : ''}`}
            onClick={onToggleMembers}
            title={showMembersSidebar ? "Скрыть список участников" : "Показать список участников"}
          >
            <UsersIcon size={18 * interfaceScale} />
          </button>
        )}
      </div>

      {showPins && (
        <div className="pins-overlay" onClick={() => setShowPins(false)}>
          <div className="pins-modal glass-panel-base" onClick={e => e.stopPropagation()}>
            <div className="pins-header">
              <h3>Закрепленные сообщения</h3>
              <button className="close-pins" onClick={() => setShowPins(false)}>×</button>
            </div>
            <div className="pins-list">
              {pinnedMessages.length === 0 ? (
                <div className="empty-pins">Нет закрепленных сообщений</div>
              ) : (
                pinnedMessages.map(msg => {
                  const member = memberMap.get(String(msg.author._id));
                  return (
                    <div key={msg._id} className="pin-item">
                      <div className="pin-author">
                        <UserAvatar user={msg.author} avatarOverride={member?.avatar || undefined} size={24 * interfaceScale} className="pin-avatar-comp" />
                        <span className="pin-name">{member?.nickname || msg.author.displayName || msg.author.username}</span>
                        <UserBadges badges={msg.author.badges} serverTag={resolveServerTag(msg.author)} size={12 * interfaceScale} />
                        <span className="pin-date">{formatDate(msg.createdAt)}</span>
                      </div>
                      <div className="pin-content">
                        {msg.content}
                        {msg.attachments?.some(a => a.type?.startsWith('image/') || a.type?.startsWith('video/')) && (
                          <div className="pin-media-preview" style={{ marginTop: '8px', display: 'flex', gap: '5px', overflowX: 'auto' }}>
                            {msg.attachments.filter(a => a.type?.startsWith('image/') || a.type?.startsWith('video/')).map((a, i) => (
                              <div key={i} className="pin-media-item" style={{ width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--glass-border)' }}>
                                {a.type?.startsWith('image/') ? (
                                  <img 
                                    src={getFullUrl(a.url)!} 
                                    alt="" 
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                                    onClick={() => {
                                      setLightboxMedia(msg.attachments!.filter(att => att.type?.startsWith('image/') || att.type?.startsWith('video/')).map(att => ({ 
                                        url: getFullUrl(att.url)!, 
                                        type: att.type?.startsWith('video/') ? 'video' : 'image', 
                                        filename: att.filename 
                                      })));
                                      setLightboxIndex(i);
                                      setLightboxOpen(true);
                                    }}
                                  />
                                ) : (
                                  <div className="pin-video-placeholder" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                                    <CameraIcon size={20 * interfaceScale} color="var(--primary-neon)" />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button className="unpin-btn" onClick={() => handleTogglePin(msg._id)}>Открепить</button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      <StickyPins pinnedMessages={pinnedMessages} onOpenPins={() => setShowPins(true)} />

      <div className="messages-container">
        {messages.length > 0 && (
          <ChatScrollEngine
            ref={chatEngineRef}
            chatId={channel._id}
            items={messages}
            getItemKey={(item) => item._id}
            interfaceScale={interfaceScale}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={onLoadMore}
            initialUnreadCount={initialUnreadCount}
            onAtBottomStateChange={handleAtBottomStateChange}
            header={
              isLoadingMore ? (
                <div className="loading-more">
                  <SkeletonList rows={3} avatarSize={36} lines={2} />
                </div>
              ) : null
            }
            footer={
              (() => {
                const typingNames = Array.from(typingUsers)
                  .map(id => memberMap.get(String(id)))
                  .filter(Boolean)
                  .map(m => m?.nickname || (m?.user as any)?.displayName || (m?.user as any)?.username)
                  .filter(Boolean);
                if (typingNames.length === 0) return <div style={{ height: 32 }} />;
                return (
                  <div className="typing-indicator-new" style={{ marginBottom: 16 }}>
                    <div className="typing-dots">
                      <span className="dot"></span>
                      <span className="dot"></span>
                      <span className="dot"></span>
                    </div>
                    <span className="typing-text">
                      {typingNames.length === 1 ? (
                        <><strong>{typingNames[0]}</strong> печатает...</>
                      ) : typingNames.length === 2 ? (
                        <><strong>{typingNames[0]}</strong> и <strong>{typingNames[1]}</strong> печатают...</>
                      ) : (
                        <><strong>Несколько человек</strong> печатают...</>
                      )}
                    </span>
                  </div>
                );
              })()
            }
            renderItem={(msg, idx, prev) => {
              const showUnread = initialUnreadCount > 0 && idx === messages.length - initialUnreadCount;
              return (
                <React.Fragment key={msg._id}>
                  {showUnread && (
                    <div className="new-messages-marker" ref={unreadRef}>
                      <div className="new-messages-line" />
                      <span>Новые сообщения</span>
                      <div className="new-messages-line" />
                    </div>
                  )}
                  <MessageItem
                    msg={msg}
                    prev={prev}
                    isFresh={hasBaseline && idx > lastSeenIdx}
                    user={user}
                    server={server}
                    memberMap={memberMap}
                    showPreview={showPreview}
                    showHoverBar={showHoverBar}
                    highlightMentions={highlightMentions}
                    canPin={canPin}
                    canReact={canReact}
                    onUserClick={onUserClick}
                    onContextMenu={handleContextMenu}
                    onTogglePin={handleTogglePin}
                    onDelete={handleDeleteMessage}
                    formatDate={formatDate}
                    renderMessageContent={renderMessageContent}
                    handleDownload={handleDownload}
                    setLightboxMedia={setLightboxMedia}
                    setLightboxIndex={setLightboxIndex}
                    setLightboxOpen={setLightboxOpen}
                    allMessages={messages}
                    onReact={handleReact}
                    onReply={handleReply}
                    scrollToMessage={scrollToMessage}
                    onInteractiveButtonClick={handleInteractiveButtonClick}
                  />
                </React.Fragment>
              );
            }}
          />
        )}
      </div>

      <div className="message-input-container">
        {replyToMessage && (
          <div className="reply-input-preview">
            <div className="reply-input-content">
              <ReplyIcon size={22 * interfaceScale} color="var(--primary-neon)" />
              <div className="reply-input-text">
                <div className="reply-input-author">
                  <span>Ответ пользователю <strong>{memberMap.get(String(replyToMessage.author._id))?.nickname || replyToMessage.author.displayName || replyToMessage.author.username}</strong></span>
                </div>
                <div className="reply-input-snippet">{replyToMessage.content || (replyToMessage.attachments?.length ? 'Вложение' : '')}</div>
              </div>
            </div>
            <button className="cancel-reply-btn" onClick={() => setReplyToMessage(null)}>×</button>
          </div>
        )}
        {(attachments.length > 0 || uploadingFiles.length > 0) && (
          <div className="attachments-preview">
            <div className="attachments-preview-list">
              {attachments.map((att, i) => (
                <div key={i} className="input-attachment-preview">
                  {att.type.startsWith('image/') ? <img src={getFullUrl(att.url)!} alt="" /> : <div className="file-icon"><DocumentIcon size={24 * interfaceScale} /></div>}
                  <button type="button" className="remove-attachment-btn" onClick={() => removeAttachment(i)}>×</button>
                </div>
              ))}
              {uploadingFiles.map(f => (
                <div key={f.id} className="input-attachment-preview uploading">
                  {f.previewUrl ? <img src={f.previewUrl} alt="" /> : <div className="file-icon"><DocumentIcon size={24 * interfaceScale} /></div>}
                  <div className="attachment-upload-overlay">
                    <span className="attachment-upload-spinner" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {isMuted ? (
          <div className="mute-composer-banner">
            <LockIcon size={18 * interfaceScale} color="var(--danger)" />
            <span>
              {isNewcomerCooldownActive ? (
                <>
                  Вы не можете отправлять сообщения на этом сервере — действует «охлаждение» новоприбывших до {effectiveMuteUntil!.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.
                </>
              ) : (
                <>
                  Вы не можете отправлять сообщения на этом сервере — вы в муте{' '}
                  {isMutePermanent ? 'навсегда' : `до ${effectiveMuteUntil!.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`}.
                </>
              )}
            </span>
          </div>
        ) : (
        <form onSubmit={handleSendMessage} className="message-form">
          <ComposerAddMenu
            onAttach={() => fileInputRef.current?.click()}
            onGif={(pos) => setShowGifPicker(pos)}
            onPoll={() => setShowPollModal(true)}
          />
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} multiple />
          <div style={{ flex: 1, position: 'relative' }}>
            {showScrollBottom && (
              <button className="scroll-bottom-btn" onClick={() => scrollToBottom(true)}>
                <ArrowDownIcon size={20 * interfaceScale} />
                <span>Новые сообщения</span>
              </button>
            )}
            {showMentions && (
              autocompleteType === 'channel' ? (
                <ChannelAutocomplete
                  query={mentionQuery}
                  items={(server.channels || []).filter(c => c.type === 'text' || c.type === 'voice' || c.type === 'room')}
                  onSelect={handleMentionSelect}
                  onClose={() => setShowMentions(false)}
                />
              ) : autocompleteType === 'emoji' ? (
                <EmojiAutocomplete
                  query={mentionQuery}
                  items={server.emojis || []}
                  onSelect={handleMentionSelect}
                  onClose={() => setShowMentions(false)}
                />
              ) : (
                <MentionAutocomplete
                  query={mentionQuery}
                  items={[
                    ...server.members.map(m => m.user),
                    ...(server.roles || []).filter(r => canMentionEveryone || r.mentionable),
                    ...(canMentionEveryone ? [
                      { _id: 'everyone', name: 'everyone', color: 'var(--primary-neon)' } as any,
                      { _id: 'here', name: 'here', color: 'var(--primary-neon)' } as any
                    ] : [])
                  ]}
                  onSelect={handleMentionSelect}
                  onClose={() => setShowMentions(false)}
                />
              )
            )}
            <textarea
              ref={inputRef}
              rows={1}
              placeholder={`Написать в #${channel.name}`}
              value={message}
              onChange={(e) => {
                handleTyping(e);
                const el = e.currentTarget;
                el.style.height = 'auto';
                const maxHeight = window.innerHeight * 0.3 - 24;
                el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
              }}
              onKeyDown={(e) => {
                const isMobileClient = isMobile || window.innerWidth <= 768;
                if (isMobileClient) return;
                const shouldSend = sendHotkey === 'shiftEnter' ? (e.key === 'Enter' && e.shiftKey) : (e.key === 'Enter' && !e.shiftKey);
                if (shouldSend) {
                  e.preventDefault();
                  handleSendMessage(e as any);
                  if (inputRef.current) inputRef.current.style.height = 'auto';
                }
              }}
              onPaste={handlePaste}
              className="message-input"
              style={{ width: '100%', resize: 'none', overflowY: 'auto' }}
            />
          </div>
          <button
            type="submit"
            className="send-button mobile-send-button"
            disabled={!message.trim() && attachments.length === 0}
            title="Отправить сообщение"
            aria-label="Отправить сообщение"
          >
            <SendIcon size={18 * interfaceScale} />
          </button>
        </form>
        )}
      </div>
      <CreatePollModal isOpen={showPollModal} onClose={() => setShowPollModal(false)} onCreate={handleCreatePoll} />
      {contextMenu && (
        <MemberContextMenu user={contextMenu.user} server={server} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} onMention={handleMention} onOpenProfile={onUserClick} reportMessageId={contextMenu.messageId} />
      )}
      {showGifPicker && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
          onClick={() => setShowGifPicker(null)}
        >
          <div
            style={{
              position: 'fixed',
              top: Math.max(10, showGifPicker.y),
              left: Math.max(10, showGifPicker.x),
              zIndex: 10000
            }}
            onClick={e => e.stopPropagation()}
          >
            <GifPicker
              onSelect={handleGifSelect}
              onClose={() => setShowGifPicker(null)}
            />
          </div>
        </div>,
        document.body
      )}
      <MediaLightbox isOpen={lightboxOpen} onClose={() => setLightboxOpen(false)} media={lightboxMedia} initialIndex={lightboxIndex} />
      {attachmentsEverOpened && createPortal(
        <React.Suspense fallback={null}>
          <AttachmentsModal
            isOpen={showAttachments}
            onClose={() => setShowAttachments(false)}
            channelId={channel._id}
            title={`#${channel.name}`}
          />
        </React.Suspense>,
        document.body
      )}
      <MessageSearchPanel
        open={showSearch}
        onClose={() => setShowSearch(false)}
        endpoint={`/api/messages/channel/${channel._id}/search`}
        onJump={jumpToMessage}
      />
    </div>
  );
};

export default ChannelView;
