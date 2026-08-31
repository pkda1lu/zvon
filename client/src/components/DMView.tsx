import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChatScrollEngine, ChatScrollEngineHandle } from './ChatScrollEngine';
import { motion } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { DirectMessage, Message, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import axios from 'axios';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { formatClockTime } from '../utils/time';
import { SmileIcon, PinIcon, ReplyIcon, TrashIcon, DownloadIcon, DocumentIcon, PlusIcon, PhoneIcon, ArrowDownIcon, CopyIcon, CameraIcon, SearchIcon, ForwardIcon, SendIcon, BlockIcon, PaperclipIcon } from './Icons';
import MessageSearchPanel from './MessageSearchPanel';
import CustomVideoPlayer from './CustomVideoPlayer';
import CustomAudioPlayer from './CustomAudioPlayer';
import MediaLightbox from './MediaLightbox';
import MentionAutocomplete from './MentionAutocomplete';
import EmojiAutocomplete from './EmojiAutocomplete';
import { SkeletonList } from './Skeleton';
import { useChatSettings } from '../contexts/ChatSettingsContext';
import { useAppearance } from '../contexts/AppearanceContext';
import UserAvatar from './UserAvatar';
import EmojiPicker from './EmojiPicker';
import GifPicker from './GifPicker';
import Reactions from './Reactions';
import MessagePoll from './MessagePoll';
import CreatePollModal from './CreatePollModal';
import ComposerAddMenu from './ComposerAddMenu';
import type { ChatPoll } from './MessagePoll';
import StickyPins from './StickyPins';
import UserBadges, { resolveServerTag } from './UserBadges';
const AttachmentsModal = React.lazy(() => import('./AttachmentsModal'));
import ServerInviteCard from './ServerInviteCard';
import { extractInviteCodes, matchInviteCode, openInviteInApp } from '../utils/inviteLinks';
import './panel-hero.css';
import './ChannelView.css';
import './DMView.css';
import './Attachments.css';

// Helper for inline markdown shared across components
const renderInlineMarkdown = (
  text: string, 
  customConfirm: (msg: string, title?: string, confirmText?: string, cancelText?: string) => Promise<boolean>,
  openLink: (url: string) => void
) => {
  if (!text) return null;
  
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

interface DMViewProps {
  dm: DirectMessage;
  messages: Message[];
  socket: Socket | null;
  onClose: () => void;
  onStartCall: (user: User, dmId: string) => void;
  onStartGroupCall: () => void;
  onUserClick: (userId: string, event?: React.MouseEvent) => void;
  initialUnreadCount?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => Promise<void>;
  pinnedMessages?: Message[];
  setMessages?: React.Dispatch<React.SetStateAction<Message[]>>;
  onBack?: () => void;
  isMobile?: boolean;
}
const DMMessageItem = React.memo<{
  msg: Message;
  prev: Message | undefined;
  user: User | null;
  dmId: string;
  showPreview: boolean;
  showHoverBar: boolean;
  highlightMentions: boolean;
  dispAuthor: (a: any) => any;
  onUserClick: (userId: string, event?: React.MouseEvent) => void;
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
  onInteractiveButtonClick?: (messageId: string, actionId: string) => void;
  isFresh?: boolean;
}>(({
  msg, prev, user, dmId, showPreview, showHoverBar, highlightMentions,
  dispAuthor, onUserClick, onTogglePin, onDelete, formatDate, renderMessageContent,
  handleDownload, setLightboxMedia, setLightboxIndex, setLightboxOpen, allMessages,
  onReact, onReply, scrollToMessage, onInteractiveButtonClick, isFresh
}) => {
  const { confirm: customConfirm } = useDialog();
  const { interfaceScale } = useAppearance();
  const [showEmojiPicker, setShowEmojiPicker] = useState<{ x: number, y: number } | null>(null);

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
                  <div className="embed-field-name">{renderInlineMarkdown(f.name, customConfirm, openLink)}</div>
                  <div className="embed-field-value">{renderInlineMarkdown(f.value, customConfirm, openLink)}</div>
                </div>
              ))}
            </div>
          )}

          {embed.image && (
            <img 
              src={embed.image.url || embed.image} 
              className="embed-image" 
              alt="" 
              onClick={() => {
                const imgUrl = embed.image.url || embed.image;
                setLightboxMedia([{ url: imgUrl, type: 'image' }]);
                setLightboxIndex(0);
                setLightboxOpen(true);
              }}
            />
          )}

          {embed.footer && (
            <div className="embed-footer">
              {embed.footer.icon_url && <img src={embed.footer.icon_url} className="embed-footer-icon" alt="" />}
              <span className="embed-footer-text">{renderInlineMarkdown(embed.footer.text, customConfirm, openLink)}</span>
            </div>
          )}
        </div>
        {embed.thumbnail && (
          <img src={embed.thumbnail.url || embed.thumbnail} className="embed-thumbnail" alt="" />
        )}
      </div>
    );
  };

  const showDate = !prev || new Date(msg.createdAt).toDateString() !== new Date(prev.createdAt).toDateString();
  const grouped = !showDate && !!prev && prev.author._id === msg.author._id && (new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000);

  if (msg.type === 'missed-call') {
    return (
      <React.Fragment>
        {showDate && <div className="message-date-divider"><span>{formatDate(msg.createdAt)}</span></div>}
        <div className="system-message missed-call" id={`msg-${msg._id}`}>
          <div className="system-message-icon" style={{ color: '#ff4d4d' }}>
            <PhoneIcon size={18 * interfaceScale} color="#ff4d4d" />
          </div>
          <div className="system-message-content" style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <span className="system-message-text">
              {dispAuthor(msg.author)._masked ? (
                <strong style={{ color: 'var(--primary-neon)' }}>Модерация</strong>
              ) : (
                <strong style={{ color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => onUserClick(dispAuthor(msg.author)._id)}>
                  {dispAuthor(msg.author).displayName || dispAuthor(msg.author).username}
                </strong>
              )}: Пропущенный звонок
            </span>
            <span className="system-message-time">{formatClockTime(msg.createdAt)}</span>
          </div>
        </div>
      </React.Fragment>
    );
  }

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
        {...messageProps}
      >
        {msg.replyTo && (
          <div className="message-reply-preview" onClick={() => scrollToMessage(msg.replyTo!._id, msg.replyTo!.createdAt)}>
            <div className="reply-line" />
            <ReplyIcon size={12 * interfaceScale} className="reply-icon-mini" />
            <UserAvatar user={dispAuthor(msg.replyTo.author)} size={16 * interfaceScale} className="reply-avatar" />
            <span className="reply-author">{dispAuthor(msg.replyTo.author).displayName || dispAuthor(msg.replyTo.author).username}</span>
            {!dispAuthor(msg.replyTo.author)._masked && <UserBadges badges={dispAuthor(msg.replyTo.author).badges} serverTag={resolveServerTag(dispAuthor(msg.replyTo.author))} size={10 * interfaceScale} />}
            <span className="reply-content">{msg.replyTo.content || (msg.replyTo.attachments?.length ? 'Вложение' : '')}</span>
          </div>
        )}
        {!grouped && (
          <div className="message-author-avatar-wrap">
            <UserAvatar
              user={dispAuthor(msg.author)}
              size={42 * interfaceScale}
              className="message-author-avatar"
              onClick={() => { if (!dispAuthor(msg.author)._masked) onUserClick(dispAuthor(msg.author)._id); }}
            />
          </div>
        )}
        {grouped && <div className="message-time-mini">{formatClockTime(msg.createdAt)}</div>}

        <div className="message-content">
          <div className="message-header">
            {!grouped && (
              <div className="message-author-info">
                {dispAuthor(msg.author)._masked ? (
                  <span className="message-author" style={{ color: 'var(--primary-neon)' }}>Модерация</span>
                ) : (
                  <span
                    className="message-author"
                    onClick={() => onUserClick(dispAuthor(msg.author)._id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {dispAuthor(msg.author).displayName || dispAuthor(msg.author).username}
                  </span>
                )}
                {!dispAuthor(msg.author)._masked && <UserBadges badges={dispAuthor(msg.author).badges} serverTag={resolveServerTag(dispAuthor(msg.author))} size={14 * interfaceScale} />}
                {!dispAuthor(msg.author)._masked && dispAuthor(msg.author).isBot && <span className="bot-badge">БOТ</span>}
                <span className="message-time">{formatDate(msg.createdAt)}</span>
              </div>
            )}

            {showHoverBar && (
              <div className={`message-actions-hover ${grouped ? 'mini' : ''}`}>
                <button
                  className={`msg-action-btn ${grouped ? 'mini' : ''}`}
                  onClick={() => onTogglePin(msg._id)}
                  title={msg.pinned ? "Открепить" : "Закрепить"}
                >
                  <PinIcon size={(grouped ? 14 : 16) * interfaceScale} fill={msg.pinned ? "var(--primary-neon)" : "none"} color={msg.pinned ? "var(--primary-neon)" : "currentColor"} />
                </button>
                <button
                  className={`msg-action-btn ${grouped ? 'mini' : ''}`}
                  onClick={(e) => setShowEmojiPicker({ x: e.clientX, y: e.clientY })}
                  title="Добавить реакцию"
                >
                  <SmileIcon size={(grouped ? 14 : 16) * interfaceScale} />
                </button>
                <button
                  className={`msg-action-btn ${grouped ? 'mini' : ''}`}
                  onClick={() => onReply(msg)}
                  title="Ответить"
                >
                  <ReplyIcon size={(grouped ? 14 : 16) * interfaceScale} />
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
                  <CopyIcon size={(grouped ? 14 : 16) * interfaceScale} />
                </button>
                <button
                  className={`msg-action-btn ${grouped ? 'mini' : ''}`}
                  onClick={() => window.dispatchEvent(new CustomEvent('open-forward', { detail: { message: msg } }))}
                  title="Переслать"
                >
                  <ForwardIcon size={(grouped ? 14 : 16) * interfaceScale} />
                </button>
                {dispAuthor(msg.author)._id === user?._id && (
                  <button className={`msg-action-btn danger ${grouped ? 'mini' : ''}`} onClick={() => onDelete(msg._id)} title="Удалить">
                    <TrashIcon size={(grouped ? 14 : 16) * interfaceScale} />
                  </button>
                )}
              </div>
            )}
          </div>

          {msg.pinned && !grouped && <div className="pinned-indicator"><PinIcon size={12 * interfaceScale} fill="var(--primary-neon)" color="var(--primary-neon)" /> Закреплено</div>}

          {msg.forwardedFrom && (
            <div className="forwarded-label">
              <ForwardIcon size={13 * interfaceScale} />
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
                        <DownloadIcon size={16 * interfaceScale} />
                      </button>
                    </div>
                  ) : att.type.startsWith('video/') ? (
                    <div className="attachment-video-wrapper">
                      <CustomVideoPlayer src={getFullUrl(att.url)!} onExpand={(currentTime) => {
                        const allMedia = allMessages.flatMap((m: any) => m.attachments || []).filter((a: any) => a.type.startsWith('image/') || a.type.startsWith('video/')).map((a: any) => ({ ...a }));
                        const idx = allMedia.findIndex((a: any) => a.url === att.url);
                        if (idx !== -1) (allMedia[idx] as any).startTime = currentTime;
                        setLightboxMedia(allMedia);
                        setLightboxIndex(idx);
                        setLightboxOpen(true);
                      }} />
                      <button onClick={(e) => handleDownload(e, getFullUrl(att.url)!, att.filename)} className="attachment-download-btn video" title="Скачать">
                        <DownloadIcon size={16 * interfaceScale} />
                      </button>
                    </div>
                  ) : (att.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(att.filename || '')) ? (
                    <div className="attachment-audio-container">
                      <CustomAudioPlayer src={getFullUrl(att.url)!} filename={att.filename} />
                      <button onClick={(e) => handleDownload(e, getFullUrl(att.url)!, att.filename)} className="attachment-download-btn audio" title="Скачать">
                        <DownloadIcon size={16 * interfaceScale} />
                      </button>
                    </div>
                  ) : (
                    <div className="attachment-file-container">
                      <a href={getFullUrl(att.url)!} target="_blank" rel="noopener noreferrer" className="attachment-file">
                        <DocumentIcon size={18 * interfaceScale} />
                        <span>{att.filename}</span>
                      </a>
                      <button onClick={(e) => handleDownload(e, getFullUrl(att.url)!, att.filename)} className="attachment-download-btn file" title="Скачать">
                        <DownloadIcon size={16 * interfaceScale} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {msg.poll && (
            <MessagePoll
              messageId={msg._id}
              poll={msg.poll}
              currentUserId={user?._id || ''}
            />
          )}

          {msg.buttons && msg.buttons.length > 0 && (
            <div className="message-interactive-buttons">
              {msg.buttons.reduce((acc: any[][], btn: any) => {
                const lastRow = acc[acc.length - 1];
                if (!lastRow || lastRow.length >= 5) {
                  acc.push([btn]);
                } else {
                  lastRow.push(btn);
                }
                return acc;
              }, []).map((row, rowIdx) => (
                <div key={rowIdx} className="button-row">
                  {row.map((btn, btnIdx) => {
                    const isUrl = !!btn.url;
                    const btnClass = `msg-button ${btn.style || 'primary'}`;
                    return isUrl ? (
                      <a
                        key={btnIdx}
                        href={btn.url}
                        className={btnClass}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          customConfirm(
                            `Вы собираетесь перейти на внешний ресурс: ${btn.url}. Продолжить?`,
                            'Внешняя ссылка',
                            'Перейти',
                            'Отмена'
                          ).then((ok: boolean) => {
                            if (ok) openLink(btn.url);
                          });
                        }}
                      >
                        {btn.label}
                      </a>
                    ) : (
                      <button
                        key={btnIdx}
                        className={btnClass}
                        onClick={() => onInteractiveButtonClick && onInteractiveButtonClick(msg._id, btn.custom_id || btn.id || btn.label)}
                      >
                        {btn.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {showPreview && msg.embeds && msg.embeds.length > 0 && (
            <div className="message-embeds">
              {msg.embeds.map((embed: any, i: number) => renderEmbed(embed, i))}
            </div>
          )}

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
});
const UNKNOWN_AUTHOR = {
  _id: '',
  username: 'Удалённый пользователь',
  displayName: '',
  avatar: null,
  badges: [] as any[],
  isBot: false,
};

const DMView: React.FC<DMViewProps> = ({
  dm, messages, socket, onClose, onStartCall, onStartGroupCall, onUserClick, initialUnreadCount = 0,
  hasMore = false, isLoadingMore = false, onLoadMore, pinnedMessages = [], setMessages,
  onBack, isMobile
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

  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<{ id: string; name: string; previewUrl: string | null }[]>([]);
  const unreadRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxMedia, setLightboxMedia] = useState<any[]>([]);
  const [hasScrolledToNew, setHasScrolledToNew] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [autocompleteType, setAutocompleteType] = useState<'mention' | 'emoji'>('mention');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [friends, setFriends] = useState<User[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showPins, setShowPins] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  const chatEngineRef = useRef<ChatScrollEngineHandle>(null);
  const atBottomRef = useRef(true);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    atBottomRef.current = atBottom;
    setShowScrollBottom(!atBottom);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    chatEngineRef.current?.scrollToBottom(smooth);
  }, []);

  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachmentsEverOpened, setAttachmentsEverOpened] = useState(false);
  useEffect(() => { if (showAttachments) setAttachmentsEverOpened(true); }, [showAttachments]);
  const [showGifPicker, setShowGifPicker] = useState<{ x: number, y: number } | null>(null);
  const [showPollModal, setShowPollModal] = useState(false);

  const lastSeenIdRef = useRef<string | null>(null);
  const prevLastSeenId = lastSeenIdRef.current;
  const lastSeenIdx = prevLastSeenId
    ? messages.findIndex(m => m._id === prevLastSeenId)
    : -1;
  const hasBaseline = prevLastSeenId !== null && lastSeenIdx !== -1;
  useEffect(() => {
    if (messages.length > 0) lastSeenIdRef.current = messages[messages.length - 1]._id;
  }, [messages]);

  useEffect(() => {
    if (!socket) return;
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

    const handleTyping = (data: { userId: string; dmId?: string }) => {
      if (data.dmId === dm._id && data.userId !== user?._id) {
        setTypingUsers((prev) => new Set(prev).add(data.userId));
      }
    };
    const handleStoppedTyping = (data: { userId: string; dmId?: string }) => {
      if (data.dmId === dm._id) {
        setTypingUsers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(data.userId);
          return newSet;
        });
      }
    };
    socket.on('user-typing', handleTyping);
    socket.on('user-stopped-typing', handleStoppedTyping);

    const handleScrollChat = (e: any) => {
      const { direction } = e.detail;
      chatEngineRef.current?.scrollBy({ top: direction === 'up' ? -300 : 300, behavior: 'smooth' });
    };

    const handleEditLast = () => {
      const myLastMsg = [...messages].reverse().find(m => m.author._id === user?._id);
      if (myLastMsg) {
        window.dispatchEvent(new CustomEvent('zvon-edit-message', { detail: { message: myLastMsg } }));
      }
    };

    const handleDeleteLast = async () => {
      const myLastMsg = [...messages].reverse().find(m => m.author._id === user?._id);
      if (myLastMsg && await customConfirm('Удалить ваше последнее сообщение?')) {
        socket.emit('delete-message', { messageId: myLastMsg._id, dmId: dm._id });
      }
    };

    window.addEventListener('zvon-scroll-chat', handleScrollChat);
    window.addEventListener('zvon-edit-last-message', handleEditLast);
    window.addEventListener('zvon-delete-last-message', handleDeleteLast);

    return () => {
      socket.off('message-reactions-update', handleReactionsUpdate);
      socket.off('message-poll-update', handlePollUpdate);
      socket.off('user-typing', handleTyping);
      socket.off('user-stopped-typing', handleStoppedTyping);
      window.removeEventListener('zvon-scroll-chat', handleScrollChat);
      window.removeEventListener('zvon-edit-last-message', handleEditLast);
      window.removeEventListener('zvon-delete-last-message', handleDeleteLast);
    };
  }, [socket, setMessages, messages, user?._id, dm._id, customConfirm]);

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
          const res = await axios.get(`/api/direct-messages/${dm._id}/messages`, { params: { before: beforeParam, limit: 50 } });
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

  const handleReact = useCallback((messageId: string, emoji: string) => {
    axios.post(`/api/messages/${messageId}/reactions`, { emoji });
  }, []);

  const handleReply = useCallback((m: Message) => {
    setReplyToMessage(m);
    inputRef.current?.focus();
  }, []);

  const handleInteractiveButtonClick = useCallback((messageId: string, actionId: string) => {
    socket?.emit('interactive-button-click', { messageId, actionId, dmId: dm._id });
  }, [socket, dm._id]);

  const otherUser = dm.participants.find(p => p._id !== user?._id);
  const isGroup = dm.participants.length > 2 || !!dm.name;
  const otherParticipants = dm.participants.filter(p => p._id !== user?._id);
  const moderatorId = dm.isModeration ? (typeof dm.moderator === 'object' ? dm.moderator?._id : dm.moderator) : null;
  const maskModeration = !!moderatorId && moderatorId !== user?._id;
  const isModerationChat = !!dm.isModeration;

  const dispAuthor = useCallback((a: any) => {
    if (!a) return UNKNOWN_AUTHOR;
    return (maskModeration && a._id === moderatorId)
      ? { ...a, username: 'Модерация', avatar: null, badges: [], isBot: false, _masked: true }
      : a;
  }, [maskModeration, moderatorId]);

  const displayName = maskModeration ? 'Модерация'
    : (dm.name || (isGroup ? otherParticipants.map(p => p.displayName || p.username).join(', ') : (otherUser?.displayName || otherUser?.username)) || 'Личные сообщения');
  const headerUser = maskModeration ? { username: 'Модерация', avatar: null } : otherUser;

  const blockNotice = dm.blockState?.iBlocked
    ? 'Вы заблокировали этого пользователя. Снять блокировку можно в настройках, раздел «Приватность».'
    : dm.blockState?.blockedMe
      ? 'Вы не можете писать этому пользователю.'
      : null;

  const formatDate = useCallback((dateString: string) => {
    const d = new Date(dateString);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const timeStr = formatClockTime(d);

    if (isToday) return `Сегодня в ${timeStr}`;
    if (isYesterday) return `Вчера в ${timeStr}`;
    return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${timeStr}`;
  }, []);
  const renderMessageContent = useCallback((content: string, mentions: User[] = []) => {
    const parts = content.split(/(```[\s\S]*?```|:[a-zA-Z0-9_+-]+:|@+[\p{L}\p{N}_.-]+)/gu);

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

          if (part.startsWith('@')) {
            const name = part.replace(/^@+/, '');
            const userMentionByName = mentions.find(m => m.username === name);
            const userMentionIndex = userMentionByName ? -1 : mentions.findIndex((m, idx) => {
              const prevUserMentions = parts.slice(0, i).filter(p => p.startsWith('@'));
              return prevUserMentions.length === idx;
            });
            const userMention = userMentionByName || (userMentionIndex !== -1 ? mentions[userMentionIndex] : undefined);
            if (userMention) {
              return (
                <span
                  key={`mention-${i}`}
                  className="mention-tag user-mention"
                  onClick={(e) => {
                    if (userMention) {
                      e.stopPropagation();
                      onUserClick(userMention._id);
                    }
                  }}
                >
                  @{name}
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
  }, [onUserClick, customConfirm, openLink]);

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
      socket?.emit('delete-message', { messageId, dmId: dm._id });
    }
  }, [customConfirm, socket, dm._id]);

  useEffect(() => {
    setHasScrolledToNew(false);
    fetchFriends();
  }, [dm._id]);

  const fetchFriends = async () => {
    try {
      const response = await axios.get('/api/friends');
      setFriends(response.data);
    } catch (e) { }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);

    const cursorPosition = e.target.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAtSignIndex = textBeforeCursor.lastIndexOf('@');
    const lastColonSignIndex = textBeforeCursor.lastIndexOf(':');

    const triggers = [
      { type: 'mention' as const, index: lastAtSignIndex },
      { type: 'emoji' as const, index: lastColonSignIndex }
    ].filter(t => t.index !== -1).sort((a, b) => b.index - a.index);

    const activeTrigger = triggers[0];

    if (activeTrigger && (activeTrigger.type === 'emoji' ? emojiAutocomplete : true)) {
      const query = textBeforeCursor.substring(activeTrigger.index + 1);
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
    socket.emit('typing-start', { dmId: dm._id });
    typingTimeoutRef.current = setTimeout(() => { socket.emit('typing-stop', { dmId: dm._id }); }, 3000);
  };

  const handleMentionSelect = (item: any) => {
    const before = message.substring(0, mentionStartIndex);
    const after = message.substring(mentionStartIndex + mentionQuery.length + 1);
    let insertText = '';

    if (autocompleteType === 'emoji') {
      insertText = `:${item.name}:`;
    } else {
      const isUser = 'username' in item;
      const rawName = isUser ? item.username : item.name;
      const name = (rawName || '').replace(/^@+/, '');
      insertText = `@${name}`;
    }

    const newMessage = `${before}${insertText} ${after}`;
    setMessage(newMessage);
    setShowMentions(false);

    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // TTS Effect
  useEffect(() => {
    if (!textToSpeech || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.author._id !== user?._id && hasScrolledToNew) {
      const utterance = new SpeechSynthesisUtterance(`${dispAuthor(lastMsg.author).displayName || dispAuthor(lastMsg.author).username} сказал: ${lastMsg.content}`);
      utterance.lang = 'ru-RU';
      window.speechSynthesis.speak(utterance);
    }
  }, [messages.length, textToSpeech, hasScrolledToNew, user?._id, dispAuthor, messages]);

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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && attachments.length === 0) || !socket) return;
    chatEngineRef.current?.setJustSent();
    socket.emit('send-message', {
      content: message.trim(),
      dmId: dm._id,
      attachments,
      replyToId: replyToMessage?._id
    });
    setMessage('');
    setAttachments([]);
    setReplyToMessage(null);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing-stop', { dmId: dm._id });
  };

  const handleCreatePoll = (poll: ChatPoll) => {
    if (!socket) return;
    chatEngineRef.current?.setJustSent();
    socket.emit('send-message', {
      content: '',
      dmId: dm._id,
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
      dmId: dm._id,
      attachments: [attachment],
      replyToId: replyToMessage?._id
    });
    setShowGifPicker(null);
    setReplyToMessage(null);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing-stop', { dmId: dm._id });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadComposerFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      const items = Array.from(e.clipboardData.items);
      const isFile = items.some(item => item.kind === 'file');

      if (isFile) {
        e.preventDefault();
        await uploadComposerFiles(Array.from(e.clipboardData.files));
      }
    }
  };

  return (
    <div
      className={`channel-view dm-view panel-hero ${isDragging ? 'dragging' : ''}`}
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

      <div className="channel-header dm-header">
        {isMobile && (
          <button className="mobile-close-btn" onClick={onBack || onClose} title="Назад">
            <svg width={24 * interfaceScale} height={24 * interfaceScale} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
        )}

        <div
          className="channel-header-info dm-header-info"
          onClick={() => !isGroup && !maskModeration && otherUser && onUserClick(otherUser._id)}
          style={{ cursor: (isGroup || maskModeration) ? 'default' : 'pointer' }}
          title={isGroup || maskModeration ? undefined : "Открыть профиль пользователя"}
        >
          <UserAvatar
            user={maskModeration ? headerUser : (isGroup ? null : otherUser)}
            size={36 * interfaceScale}
            className="dm-avatar"
            onClick={(e) => {
              if (isGroup || maskModeration) return;
              e.stopPropagation();
              otherUser && onUserClick(otherUser._id);
            }}
          />
          <div className="dm-header-text-info">
            <div className="dm-display-name-row">
              <h3
                className="dm-display-name"
                onClick={(e) => {
                  if (isGroup || maskModeration) return;
                  e.stopPropagation();
                  otherUser && onUserClick(otherUser._id);
                }}
                style={{ cursor: (isGroup || maskModeration) ? 'default' : 'pointer' }}
                title={isGroup || maskModeration ? undefined : "Открыть профиль пользователя"}
              >
                {displayName}
              </h3>
              {!isGroup && !maskModeration && otherUser && <UserBadges badges={otherUser.badges} serverTag={resolveServerTag(otherUser)} size={14 * interfaceScale} />}
              {dm.blockState?.iBlocked && (
                <span className="dm-blocked-tag" title="Вы заблокировали этого пользователя">
                  <BlockIcon size={12 * interfaceScale} />
                  Заблокирован
                </span>
              )}
            </div>
            {maskModeration ? (
              <div className="dm-status-subtext">Официальное обращение</div>
            ) : isModerationChat ? (
              <div className="dm-status-subtext">Чат от имени модерации</div>
            ) : !isGroup ? (
              <div className="dm-status-subtext">
                {otherUser?.status === 'online' ? 'В сети' : otherUser?.status === 'away' ? 'Нет на месте' : otherUser?.status === 'busy' ? 'Занят' : 'Не в сети'}
              </div>
            ) : (
              <div className="dm-status-subtext muted">{dm.participants.length} участников</div>
            )}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <button
          className="header-action-btn"
          disabled={!!blockNotice}
          onClick={() => {
            if (blockNotice) return;
            isGroup ? onStartGroupCall() : (otherUser && onStartCall(otherUser, dm._id));
          }}
          title={blockNotice ? 'Звонок недоступен' : (isGroup ? 'Начать групповой звонок' : 'Начать голосовой звонок')}
        >
          <PhoneIcon size={20 * interfaceScale} />
        </button>
        <button
          className="header-action-btn"
          onClick={() => setShowAttachments(true)}
          title="Вложения диалога"
        >
          <PaperclipIcon size={20 * interfaceScale} color={showAttachments ? "var(--primary-neon)" : "var(--text-dim)"} />
        </button>
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
                pinnedMessages.map(msg => (
                  <div key={msg._id} className="pin-item">
                    <div className="pin-author">
                      <UserAvatar user={dispAuthor(msg.author)} size={24 * interfaceScale} className="pin-avatar-comp" />
                      <span className="pin-name">{dispAuthor(msg.author).displayName || dispAuthor(msg.author).username}</span>
                      {!dispAuthor(msg.author)._masked && <UserBadges badges={dispAuthor(msg.author).badges} serverTag={resolveServerTag(dispAuthor(msg.author))} size={12 * interfaceScale} />}
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
                ))
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
            chatId={dm._id}
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
                  .map(id => dm.participants.find(p => String(p._id) === String(id)))
                  .filter(Boolean)
                  .map(p => p?.displayName || p?.username)
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
                  <DMMessageItem
                    msg={msg}
                    prev={prev}
                    isFresh={hasBaseline && idx > lastSeenIdx}
                    user={user}
                    dmId={dm._id}
                    showPreview={showPreview}
                    showHoverBar={showHoverBar}
                    highlightMentions={highlightMentions}
                    dispAuthor={dispAuthor}
                    onUserClick={onUserClick}
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
                  <span>Ответ пользователю <strong>{dispAuthor(replyToMessage.author).displayName || dispAuthor(replyToMessage.author).username}</strong></span>
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
        {blockNotice ? (
          <div className="mute-composer-banner">
            <BlockIcon size={18 * interfaceScale} color="var(--danger)" />
            <span>{blockNotice}</span>
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
                autocompleteType === 'emoji' ? (
                  <EmojiAutocomplete
                    query={mentionQuery}
                    items={[]}
                    onSelect={handleMentionSelect}
                    onClose={() => setShowMentions(false)}
                  />
                ) : (
                  <MentionAutocomplete
                    query={mentionQuery}
                    items={friends}
                    onSelect={handleMentionSelect}
                    onClose={() => setShowMentions(false)}
                  />
                )
              )}
              <textarea
                ref={inputRef}
                rows={1}
                placeholder={maskModeration ? 'Написать модерации...' : `Написать ${otherUser?.displayName || otherUser?.username || ''}...`}
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

      <MediaLightbox
        isOpen={lightboxOpen}
        media={lightboxMedia}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />

      {attachmentsEverOpened && createPortal(
        <React.Suspense fallback={null}>
          <AttachmentsModal
            isOpen={showAttachments}
            onClose={() => setShowAttachments(false)}
            dmId={dm._id}
            title={displayName}
          />
        </React.Suspense>,
        document.body
      )}

      <MessageSearchPanel
        open={showSearch}
        onClose={() => setShowSearch(false)}
        endpoint={`/api/direct-messages/${dm._id}/search`}
        onJump={jumpToMessage}
      />
    </div>
  );
};

export default DMView;
