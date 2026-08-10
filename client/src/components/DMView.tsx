import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { motion } from 'framer-motion';
import { Socket } from 'socket.io-client';
import { DirectMessage, Message, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import axios from 'axios';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { formatClockTime } from '../utils/time';
import { SmileIcon, PinIcon, ReplyIcon, TrashIcon, DownloadIcon, DocumentIcon, PlusIcon, PhoneIcon, ArrowDownIcon, CopyIcon, CameraIcon, SearchIcon, ForwardIcon } from './Icons';
import MessageSearchPanel from './MessageSearchPanel';
import VoiceCall from './VoiceCall';
import CustomVideoPlayer from './CustomVideoPlayer';
import CustomAudioPlayer from './CustomAudioPlayer';
import MediaLightbox from './MediaLightbox';
import MentionAutocomplete from './MentionAutocomplete';
import { useChatSettings } from '../contexts/ChatSettingsContext';
import { createPortal } from 'react-dom';
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
// См. комментарий в ChannelView: ленивый чанк + компонент остаётся смонтирован
// после первого открытия, чтобы не потерять анимацию закрытия AnimatedOverlay.
const AttachmentsModal = React.lazy(() => import('./AttachmentsModal'));
import ServerInviteCard from './ServerInviteCard';
import { extractInviteCodes, matchInviteCode, openInviteInApp } from '../utils/inviteLinks';
import './panel-hero.css';
import './DMView.css';
import './Attachments.css';

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

interface DMMessageItemProps {
  msg: Message;
  grouped: boolean;
  isFresh: boolean;
  user: User | null;
  dmId: string;
  socket: Socket | null;
  showPreview: boolean;
  showHoverBar: boolean;
  highlightMentions: boolean;
  dispAuthor: (a: any) => any;
  formatDate: (d: string) => string;
  renderMessageContent: (content: string, mentions?: User[]) => React.ReactNode;
  renderEmbed: (embed: any, key: number) => React.ReactNode;
  handleReact: (messageId: string, emoji: string) => void;
  handleDownload: (e: React.MouseEvent, url: string, filename: string) => void;
  handleTogglePin: (messageId: string) => void;
  scrollToMessage: (msgId: string) => void;
  onUserClick: (userId: string, event?: React.MouseEvent) => void;
  setReplyToMessage: React.Dispatch<React.SetStateAction<Message | null>>;
  inputRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement>;
  setShowEmojiPicker: React.Dispatch<React.SetStateAction<{ x: number; y: number; msgId: string } | null>>;
  setLightboxMedia: React.Dispatch<React.SetStateAction<any[]>>;
  setLightboxIndex: React.Dispatch<React.SetStateAction<number>>;
  setLightboxOpen: React.Dispatch<React.SetStateAction<boolean>>;
  allMessages: Message[];
}

// Одна строка сообщения в личке. Вынесено в отдельный React.memo-компонент, чтобы
// набор текста в поле ввода и прочие частые ре-рендеры DMView не перерисовывали
// весь список сообщений (все хендлеры-пропсы стабилизированы через useCallback).
const DMMessageItem = React.memo(function DMMessageItem({
  msg, grouped, isFresh, user, dmId, socket,
  showPreview, showHoverBar, highlightMentions,
  dispAuthor, formatDate, renderMessageContent, renderEmbed,
  handleReact, handleDownload, handleTogglePin, scrollToMessage,
  onUserClick, setReplyToMessage, inputRef, setShowEmojiPicker,
  setLightboxMedia, setLightboxIndex, setLightboxOpen, allMessages,
}: DMMessageItemProps) {
  const messageMotionProps: any = isFresh ? {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { type: 'spring', stiffness: 420, damping: 34, mass: 0.75 },
  } : {};
  const MessageBox: any = isFresh ? motion.div : 'div';

  return (
    <>
      {msg.type === 'missed-call' ? (
        <div className="message system-message missed-call">
          <div className="system-message-icon">
            <PhoneIcon color="#ff4d4d" />
          </div>
          <div className="system-message-content" style={{ marginLeft: '15px' }}>
            <div className="system-message-header message-author-info">
              {dispAuthor(msg.author)._masked ? (
                <span className="message-author" style={{ color: 'var(--primary-neon)' }}>Модерация</span>
              ) : (
                <span className="message-author" onClick={(e) => onUserClick(msg.author._id, e)} style={{ cursor: 'pointer' }}>{msg.author.username}</span>
              )}
              {!dispAuthor(msg.author)._masked && <UserBadges badges={msg.author.badges} serverTag={resolveServerTag(msg.author)} size={14} />}
              <span className="message-time">{formatDate(msg.createdAt)}</span>
            </div>
            <div className="system-message-text">Пропущенный звонок</div>
          </div>
        </div>
      ) : (
        <MessageBox
          id={`msg-${msg._id}`}
          className={`message ${grouped ? 'grouped' : 'with-author'} ${highlightMentions && msg.mentions?.some(m => m._id === user?._id) ? 'mention-highlight' : ''} ${msg.replyTo ? 'has-reply' : ''}`}
          {...messageMotionProps}
        >
          {msg.replyTo && (
            <div className="message-reply-preview" onClick={() => scrollToMessage(msg.replyTo!._id)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div className="reply-line" />
              <ReplyIcon size={12} className="reply-icon-mini" />
              <UserAvatar user={dispAuthor(msg.replyTo.author)} size={16} className="reply-avatar" />
               <span className="reply-author" style={{ fontWeight: 600 }}>{dispAuthor(msg.replyTo.author).username}</span>
               {!dispAuthor(msg.replyTo.author)._masked && <UserBadges badges={msg.replyTo.author.badges} serverTag={resolveServerTag(msg.replyTo.author)} size={10} />}
              <span className="reply-content" style={{ opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.replyTo.content || (msg.replyTo.attachments?.length ? 'Вложение' : '')}</span>
            </div>
          )}
          {!grouped && (
            <div className="message-author-avatar-wrap">
              <UserAvatar
                user={dispAuthor(msg.author)}
                size={40}
                className="message-author-avatar"
                onClick={(e) => { if (!dispAuthor(msg.author)._masked) onUserClick(msg.author._id, e); }}
              />
            </div>
          )}
          {grouped && <div className="message-time-mini">{formatClockTime(msg.createdAt)}</div>}
          <div className="message-content">
            {!grouped && (
              <div className="message-header message-author-info">
                {dispAuthor(msg.author)._masked ? (
                  <span className="message-author" style={{ color: 'var(--primary-neon)' }}>Модерация</span>
                ) : (
                  <span className="message-author" onClick={(e) => onUserClick(msg.author._id, e)} style={{ cursor: 'pointer' }}>{msg.author.username}</span>
                )}
                {!dispAuthor(msg.author)._masked && <UserBadges badges={msg.author.badges} serverTag={resolveServerTag(msg.author)} size={14} />}
                {!dispAuthor(msg.author)._masked && msg.author.isBot && <span className="bot-badge">БOТ</span>}
                <span className="message-time">{formatDate(msg.createdAt)}</span>
                {showHoverBar && (
                  <div className="message-actions-hover">
                    <button
                      className="msg-action-btn"
                      onClick={() => handleTogglePin(msg._id)}
                      title={msg.pinned ? "Открепить" : "Закрепить"}
                    >
                      <PinIcon size={16} fill={msg.pinned ? "var(--primary-neon)" : "none"} color={msg.pinned ? "var(--primary-neon)" : "currentColor"} />
                    </button>
                    <button
                      className="msg-action-btn"
                      onClick={(e) => {
                        setReplyToMessage(msg);
                        inputRef.current?.focus();
                      }}
                      title="Ответить"
                    >
                      <ReplyIcon size={16} />
                    </button>
                    <button
                      className="msg-action-btn"
                      onClick={(e) => setShowEmojiPicker({ x: e.clientX, y: e.clientY, msgId: msg._id })}
                      title="Добавить реакцию"
                    >
                      <SmileIcon size={16} />
                    </button>
                    <button
                      className="msg-action-btn"
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
                      <CopyIcon size={16} />
                    </button>
                    <button
                      className="msg-action-btn"
                      onClick={() => window.dispatchEvent(new CustomEvent('open-forward', { detail: { message: msg } }))}
                      title="Переслать"
                    >
                      <ForwardIcon size={16} />
                    </button>
                    {msg.author._id === user?._id && (
                      <button
                        className="msg-action-btn danger"
                        onClick={() => {
                          if (socket) socket.emit('delete-message', { messageId: msg._id, dmId: dmId });
                        }}
                        title="Удалить"
                      >
                        <TrashIcon size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {grouped && showHoverBar && (
              <div className="message-actions-hover mini">
                <button
                  className="msg-action-btn mini"
                  onClick={() => {
                    setReplyToMessage(msg);
                    inputRef.current?.focus();
                  }}
                  title="Ответить"
                >
                  <ReplyIcon size={14} />
                </button>
                <button
                  className="msg-action-btn mini"
                  onClick={() => handleTogglePin(msg._id)}
                >
                  <PinIcon size={14} fill={msg.pinned ? "var(--primary-neon)" : "none"} color={msg.pinned ? "var(--primary-neon)" : "currentColor"} />
                </button>
                <button
                  className="msg-action-btn mini"
                  onClick={(e) => setShowEmojiPicker({ x: e.clientX, y: e.clientY, msgId: msg._id })}
                >
                  <SmileIcon size={14} />
                </button>
                <button
                    className="msg-action-btn mini"
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
                    <CopyIcon size={14} />
                  </button>
                  <button
                    className="msg-action-btn mini"
                    onClick={() => window.dispatchEvent(new CustomEvent('open-forward', { detail: { message: msg } }))}
                    title="Переслать"
                  >
                    <ForwardIcon size={14} />
                  </button>
                  {msg.author._id === user?._id && (
                    <button
                      className="msg-action-btn mini danger"
                      onClick={() => {
                        if (socket) socket.emit('delete-message', { messageId: msg._id, dmId: dmId });
                      }}
                      title="Удалить"
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
              </div>
            )}
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

            {msg.buttons && msg.buttons.length > 0 && (
              <div className="message-interactive-buttons">
                {msg.buttons.map((btn, idx) => (
                  <a key={idx} href={btn.url} target="_blank" rel="noopener noreferrer" className={`msg-button ${btn.style || 'primary'}`}>
                    {btn.label}
                  </a>
                ))}
              </div>
            )}

            {msg.poll && <MessagePoll messageId={msg._id} poll={msg.poll as any} currentUserId={user?._id} />}

            <Reactions
              reactions={msg.reactions || []}
              currentUserId={user?._id || ''}
              onReact={(emoji) => handleReact(msg._id, emoji)}
            />

            {showPreview && msg.attachments && msg.attachments.length > 0 && (
              <div className="message-attachments">
                {msg.attachments.map((att, i) => (
                  <div key={i} className="attachment-item">
                    {att.type.startsWith('image/') ? (
                      <div className="attachment-image-container">
                        <img
                          src={getFullUrl(att.url)!}
                          alt=""
                          className="attachment-image"
                          onClick={() => {
                            const allMedia = allMessages.flatMap(m => m.attachments || []).filter(a => a.type.startsWith('image/') || a.type.startsWith('video/'));
                            setLightboxMedia(allMedia);
                            setLightboxIndex(allMedia.findIndex(a => a.url === att.url));
                            setLightboxOpen(true);
                          }}
                        />
                        <button onClick={(e) => handleDownload(e, getFullUrl(att.url)!, att.filename)} className="attachment-download-btn" title="Скачать">
                          <DownloadIcon size={16} />
                        </button>
                      </div>
                    ) : att.type.startsWith('video/') ? (
                      <div className="attachment-video-wrapper">
                        <CustomVideoPlayer src={getFullUrl(att.url)!} onExpand={(currentTime) => {
                          const allMedia = allMessages.flatMap(m => m.attachments || []).filter(a => a.type.startsWith('image/') || a.type.startsWith('video/')).map(a => ({ ...a }));
                          const idx = allMedia.findIndex(a => a.url === att.url);
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
                          <DocumentIcon size={18} />
                          <span>{att.filename}</span>
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
          </div>
        </MessageBox>
      )}
    </>
  );
});

const DMView: React.FC<DMViewProps> = ({
  dm, messages, socket, onClose, onStartCall, onStartGroupCall, onUserClick, initialUnreadCount = 0,
  hasMore = false, isLoadingMore = false, onLoadMore, pinnedMessages = [], setMessages,
  onBack, isMobile
}) => {
  const { user } = useAuth();
  const { confirm: customConfirm, alert } = useDialog();

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const unreadRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxMedia, setLightboxMedia] = useState<any[]>([]);
  const [hasScrolledToNew, setHasScrolledToNew] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [friends, setFriends] = useState<User[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showPins, setShowPins] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollerElRef = useRef<HTMLElement | null>(null);
  const atBottomRef = useRef(true);
  const justSentRef = useRef(false);
  const prevMsgCountRef = useRef(messages.length);
  const prevLastMsgIdRef = useRef<string | null>(messages[messages.length - 1]?._id ?? null);
  const FIRST_ITEM_INDEX_START = 1_000_000;
  const [firstItemIndex, setFirstItemIndex] = useState(FIRST_ITEM_INDEX_START);
  const prevFirstMsgIdRef = useRef<string | null>(null);

  useEffect(() => {
    setFirstItemIndex(FIRST_ITEM_INDEX_START);
    prevFirstMsgIdRef.current = null;
  }, [dm._id]);

  useEffect(() => {
    const newFirstId = messages[0]?._id ?? null;
    const oldFirstId = prevFirstMsgIdRef.current;
    if (oldFirstId && newFirstId && oldFirstId !== newFirstId) {
      const idxInNew = messages.findIndex(m => m._id === oldFirstId);
      if (idxInNew > 0) setFirstItemIndex(fi => fi - idxInNew);
    }
    prevFirstMsgIdRef.current = newFirstId;
  }, [messages]);

  const handleStartReached = useCallback(() => {
    if (hasMore && !isLoadingMore && onLoadMore) onLoadMore();
  }, [hasMore, isLoadingMore, onLoadMore]);

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    atBottomRef.current = atBottom;
    setShowScrollBottom(!atBottom);
  }, []);

  // Надёжная прокрутка к самому последнему сообщению.
  // Плавный скролл при динамической высоте сообщений может «не доезжать» до
  // самого низа, поэтому после анимации точечно дотягиваем позицию до конца и
  // повторяем, пока не упрёмся в дно (на случай поздней догрузки картинок/эмбедов).
  const scrollToBottom = useCallback((smooth = true) => {
    const v = virtuosoRef.current;
    if (!v) return;
    setShowScrollBottom(false);
    const targetIdx = firstItemIndex + Math.max(0, messages.length - 1);
    v.scrollToIndex({ index: targetIdx, align: 'end', behavior: smooth ? 'smooth' : 'auto' });
    let tries = 0;
    const settle = () => {
      const el = scrollerElRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
      const offset = el ? el.scrollHeight - el.scrollTop - el.clientHeight : 0;
      if (offset > 2 && tries < 15) {
        tries++;
        virtuosoRef.current?.scrollToIndex({ index: targetIdx, align: 'end', behavior: 'auto' });
        window.setTimeout(settle, 80);
      }
    };
    window.setTimeout(settle, smooth ? 300 : 30);
  }, [firstItemIndex, messages.length]);

  // Авто-прокрутка вниз при добавлении НОВОГО сообщения в конец списка.
  // Скроллим, если это наше только что отправленное сообщение либо пользователь
  // уже находился внизу. Догрузку истории и удаление сообщений не трогаем.
  useEffect(() => {
    const prevCount = prevMsgCountRef.current;
    const prevLastId = prevLastMsgIdRef.current;
    prevMsgCountRef.current = messages.length;
    const lastId = messages[messages.length - 1]?._id ?? null;
    prevLastMsgIdRef.current = lastId;

    const isAppend = messages.length > prevCount && !!lastId && lastId !== prevLastId;
    if (!isAppend) return;

    const sentByMe = justSentRef.current;
    justSentRef.current = false;
    if (sentByMe || atBottomRef.current) {
      scrollToBottom(true);
    }
  }, [messages.length, scrollToBottom]);
  const [showEmojiPicker, setShowEmojiPicker] = useState<{ x: number, y: number, msgId: string } | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachmentsEverOpened, setAttachmentsEverOpened] = useState(false);
  useEffect(() => { if (showAttachments) setAttachmentsEverOpened(true); }, [showAttachments]);
  const [showGifPicker, setShowGifPicker] = useState<{ x: number, y: number } | null>(null);
  const [showPollModal, setShowPollModal] = useState(false);

  // Same baseline trick as ChannelView: only animate truly new (incoming) messages.
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

    const handleScrollChat = (e: any) => {
      const { direction } = e.detail;
      if (virtuosoRef.current) {
        if (direction === 'up') {
          virtuosoRef.current.scrollBy({ top: -300, behavior: 'smooth' });
        } else {
          virtuosoRef.current.scrollBy({ top: 300, behavior: 'smooth' });
        }
      }
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
      window.removeEventListener('zvon-scroll-chat', handleScrollChat);
      window.removeEventListener('zvon-edit-last-message', handleEditLast);
      window.removeEventListener('zvon-delete-last-message', handleDeleteLast);
    };
  }, [socket, setMessages, messages, user?._id, dm._id]);


  const jumpToMessage = async (messageId: string, createdAt: string) => {
    setShowSearch(false);
    const alreadyLoaded = messages.some(m => m._id === messageId);
    if (!alreadyLoaded && setMessages) {
      try {
        const beforeCursor = new Date(new Date(createdAt).getTime() + 1).toISOString();
        const afterCursor = new Date(createdAt).toISOString();
        const [olderRes, newerRes] = await Promise.all([
          axios.get(`/api/direct-messages/${dm._id}/messages`, { params: { before: beforeCursor, limit: 30 } }),
          axios.get(`/api/direct-messages/${dm._id}/messages`, { params: { after: afterCursor, limit: 30 } }),
        ]);
        const merged = [...olderRes.data, ...newerRes.data];
        const seen = new Set<string>();
        const dedup = merged.filter((m: Message) => seen.has(m._id) ? false : (seen.add(m._id), true));
        dedup.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setMessages(dedup);
      } catch (e) { return; }
    }
    setFlashMessageId(messageId);
  };

  useEffect(() => {
    if (!flashMessageId) return;
    const idx = messages.findIndex(m => m._id === flashMessageId);
    if (idx >= 0 && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index: firstItemIndex + idx, behavior: 'smooth', align: 'center' });
    }
    let cancelled = false;
    const attempt = (tries: number) => {
      if (cancelled) return;
      const el = document.getElementById(`msg-${flashMessageId}`);
      if (el) {
        el.classList.add('msg-search-message-flash');
        window.setTimeout(() => el.classList.remove('msg-search-message-flash'), 1700);
        setFlashMessageId(null);
      } else if (tries > 0) {
        window.setTimeout(() => attempt(tries - 1), 100);
      } else {
        setFlashMessageId(null);
      }
    };
    attempt(15);
    return () => { cancelled = true; };
  }, [flashMessageId, messages, firstItemIndex]);

  const handleReact = useCallback((messageId: string, emoji: string) => {
    axios.post(`/api/messages/${messageId}/reactions`, { emoji });
  }, []);

  const otherUser = dm.participants.find(p => p._id !== user?._id);
  const isGroup = dm.participants.length > 2 || !!dm.name;
  const otherParticipants = dm.participants.filter(p => p._id !== user?._id);
  // Чат «от имени модерации»: пользователь (не модератор) видит собеседника и
  // авторов его сообщений как «Модерация», реальный аккаунт модератора скрыт.
  const moderatorId = dm.isModeration ? (typeof dm.moderator === 'object' ? dm.moderator?._id : dm.moderator) : null;
  const maskModeration = !!moderatorId && moderatorId !== user?._id;
  const isModerationChat = !!dm.isModeration;
  // Подменяет автора сообщения на «Модерация», если нужно скрыть личность модератора.
  const dispAuthor = useCallback((a: any) => (maskModeration && a && a._id === moderatorId)
    ? { ...a, username: 'Модерация', avatar: null, badges: [], isBot: false, _masked: true }
    : a, [maskModeration, moderatorId]);
  const displayName = maskModeration ? 'Модерация'
    : (dm.name || (isGroup ? otherParticipants.map(p => p.username).join(', ') : otherUser?.username));
  const headerUser = maskModeration ? { username: 'Модерация', avatar: null } : otherUser;

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

  const shouldShowDate = (current: Message, previous: Message | undefined) => {
    if (!previous) return true;
    return new Date(current.createdAt).getDate() !== new Date(previous.createdAt).getDate();
  };

  const isGrouped = (current: Message, previous: Message | undefined) => {
    if (!previous) return false;
    if (current.author._id !== previous.author._id) return false;
    if (shouldShowDate(current, previous)) return false;

    // Group if within 5 minutes
    const timeDiff = new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime();
    return timeDiff < 5 * 60 * 1000;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && attachments.length === 0) || !socket) return;
    justSentRef.current = true;
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
    // ...
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing-stop', { dmId: dm._id });
  };

  const handleCreatePoll = (poll: ChatPoll) => {
    if (!socket) return;
    justSentRef.current = true;
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
    justSentRef.current = true;
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
      const formData = new FormData();
      for (let i = 0; i < e.target.files.length; i++) formData.append('files', e.target.files[i]);
      try {
        const response = await axios.post('/api/upload-files', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setAttachments(prev => [...prev, ...response.data]);
      } catch (error) { await alert('Ошибка загрузки файла'); }
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      const items = Array.from(e.clipboardData.items);
      const isFile = items.some(item => item.kind === 'file');

      if (isFile) {
        e.preventDefault();
        const files = Array.from(e.clipboardData.files);
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        try {
          const response = await axios.post('/api/upload-files', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          setAttachments(prev => [...prev, ...response.data]);
        } catch (error) {
          await alert('Ошибка загрузки файла');
        }
      }
    }
  };

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
      const files = Array.from(e.dataTransfer.files);
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      try {
        const response = await axios.post('/api/upload-files', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setAttachments(prev => [...prev, ...response.data]);
      } catch (error) {
        await alert('Ошибка загрузки файла');
      }
    }
  };
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

    if (lastAtSignIndex !== -1 && emojiAutocomplete) {
      const query = textBeforeCursor.substring(lastAtSignIndex + 1);
      if (!query.includes(' ')) {
        setShowMentions(true);
        setMentionQuery(query);
        setMentionStartIndex(lastAtSignIndex);
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
    const name = item.username;
    const before = message.substring(0, mentionStartIndex);
    const after = message.substring(mentionStartIndex + mentionQuery.length + 1);

    const newMessage = `${before}@${name} ${after}`;
    setMessage(newMessage);
    setShowMentions(false);

    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const renderMessageContent = useCallback((content: string, mentions: User[] = []) => {
    if (!content) return null;
    const parts = content.split(/(@\w+)|(```[\s\S]*?```)/g);

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
            const name = part.substring(1);
            const isUserMention = mentions.some(m => m.username === name);
            if (isUserMention) {
              const userMention = mentions.find(m => m.username === name);
              return (
                <span
                  key={`mention-${i}`}
                  className="mention-tag user-mention"
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
              {part.split(/(https?:\/\/[^\s]+)/g).map((subPart, si) => {
                if (subPart.match(/^https?:\/\//)) {
                  const inviteCode = matchInviteCode(subPart);
                  // Ссылка-приглашение: внутри приложения открываем модалку-приглашение,
                  // снаружи (в браузере) та же ссылка ведёт на страницу /invite/<code>.
                  if (inviteCode) {
                    return (
                      <a
                        key={`link-${si}`}
                        href={subPart}
                        className="message-link"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openInviteInApp(inviteCode);
                        }}
                      >
                        {subPart}
                      </a>
                    );
                  }
                  return (
                    <a
                      key={`link-${si}`}
                      href={subPart}
                      className="message-link"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        customConfirm(
                          `Вы собираетесь перейти на внешний ресурс: ${subPart}. Это может быть небезопасно. Продолжить?`,
                          'Внешняя ссылка',
                          'Перейти',
                          'Отмена'
                        ).then((ok: boolean = false) => {
                          if (ok) openLink(subPart);
                        });
                      }}
                    >
                      {subPart}
                    </a>
                  );
                }
                return subPart;
              })}
            </span>
          );
        })}
      </>
    );
  }, [onUserClick, customConfirm, openLink]);

  const renderEmbed = useCallback((embed: any, key: number) => {
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
                      ).then((ok: boolean = false) => {
                        if (ok) openLink(embed.author.url);
                      });
                    }}
                >{embed.author.name}</a>
              ) : (
                <span className="embed-author-name">{embed.author.name}</span>
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
                      ).then((ok: boolean = false) => {
                        if (ok) openLink(embed.url);
                      });
                    }}
                >{embed.title}</a>
            ) : (
              <div className="embed-title">{embed.title}</div>
            )
          )}

          {embed.description && <div className="embed-description">{embed.description}</div>}

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
              {embed.footer.icon_url && <img src={embed.footer.icon_url} className="embed-footer-icon" alt="" onError={(e) => (e.target as any).style.display = 'none'} />}
              <span className="embed-footer-text">{embed.footer.text}</span>
            </div>
          )}
        </div>
        {embed.thumbnail && embed.thumbnail.url && (
          <img src={embed.thumbnail.url} className="embed-thumbnail" alt="" />
        )}
      </div>
    );
  }, [customConfirm, openLink]);

  useEffect(() => {
    if (messages.length > 0 && !hasScrolledToNew) {
      const t = window.setTimeout(() => setHasScrolledToNew(true), 400);
      return () => window.clearTimeout(t);
    } else if (messages.length === 0 && hasScrolledToNew) {
      setHasScrolledToNew(false);
    }
  }, [messages.length, hasScrolledToNew, dm._id]);

  // TTS Effect
  useEffect(() => {
    if (!textToSpeech || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.author._id !== user?._id && hasScrolledToNew) {
      const utterance = new SpeechSynthesisUtterance(`${dispAuthor(lastMsg.author).username} сказал: ${lastMsg.content}`);
      utterance.lang = 'ru-RU';
      window.speechSynthesis.speak(utterance);
    }
  }, [messages.length, textToSpeech]);

  const handleTogglePin = useCallback((messageId: string) => {
    axios.patch(`/api/messages/${messageId}/pin`);
  }, []);

  const scrollToMessage = useCallback((msgId: string) => {
    const idx = messages.findIndex(m => m._id === msgId);
    if (idx >= 0 && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index: firstItemIndex + idx, behavior: 'smooth', align: 'center' });
    }
    const tryFlash = (tries: number) => {
      const el = document.getElementById(`msg-${msgId}`);
      if (el) {
        el.classList.add('highlight-flash');
        window.setTimeout(() => el.classList.remove('highlight-flash'), 2000);
      } else if (tries > 0) {
        window.setTimeout(() => tryFlash(tries - 1), 80);
      }
    };
    tryFlash(15);
  }, [messages, firstItemIndex]);

  return (
    <div
      className={`dm-view panel-hero ${isDragging ? 'dragging' : ''}`}
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
            <div className="drag-drop-icon"><PlusIcon size={48} /></div>
            <div className="drag-drop-text">Перетащите файлы сюда для загрузки</div>
          </div>
        </div>
      )}
      <div className="dm-container">
        <div className="dm-header">
          {isMobile && (
            <button className="back-button" onClick={onBack || onClose} title="Назад">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
            </button>
          )}

          <div className="dm-header-info" onClick={(e) => !isGroup && !maskModeration && otherUser && onUserClick(otherUser._id)} style={{ cursor: (isGroup || maskModeration) ? 'default' : 'pointer' }}>
            <UserAvatar
              user={maskModeration ? headerUser : (isGroup ? null : otherUser)}
              size={40}
              className="dm-avatar"
              onClick={(e) => {
                if (isGroup || maskModeration) return;
                e.stopPropagation();
                otherUser && onUserClick(otherUser._id);
              }}
            />
            <div className="dm-header-text-info">
              <div className="dm-display-name-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 className="dm-display-name" style={{ margin: 0, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setShowAttachments(true); }}>{displayName}</h3>
                {!isGroup && !maskModeration && otherUser && <UserBadges badges={otherUser.badges} serverTag={resolveServerTag(otherUser)} size={16} />}
              </div>
              {maskModeration ? (
                <div style={{ fontSize: '12px', color: 'var(--primary-neon)', fontWeight: 600, opacity: 0.8 }}>
                  Официальное обращение
                </div>
              ) : isModerationChat ? (
                <div style={{ fontSize: '12px', color: 'var(--primary-neon)', fontWeight: 600, opacity: 0.8 }}>
                  Чат от имени модерации
                </div>
              ) : !isGroup && (
                <div style={{ fontSize: '12px', color: 'var(--primary-neon)', fontWeight: 600, opacity: 0.8 }}>
                  {otherUser?.status === 'online' ? 'В сети' : otherUser?.status === 'away' ? 'Нет на месте' : otherUser?.status === 'busy' ? 'Занят' : 'Не в сети'}
                </div>
              )}
              {isGroup && (
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontWeight: 600, opacity: 0.8 }}>
                  {dm.participants.length} участников
                </div>
              )}
            </div>
          </div>

          <button
            className="voice-call-button"
            onClick={() => isGroup ? onStartGroupCall() : (otherUser && onStartCall(otherUser, dm._id))}
            title={isGroup ? "Начать групповой звонок" : "Начать голосовой звонок"}
          >
            <PhoneIcon />
          </button>
          <button className="voice-call-button" onClick={() => setShowSearch(s => !s)} title="Поиск по сообщениям">
            <SearchIcon size={20} color={showSearch ? "var(--primary-neon)" : "var(--text-dim)"} />
          </button>
          <button className="voice-call-button" onClick={() => setShowPins(!showPins)} title="Закрепленные сообщения">
            <PinIcon size={20} fill={showPins ? "var(--primary-neon)" : "none"} color={showPins ? "var(--primary-neon)" : "var(--text-dim)"} />
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
                      <div className="pin-author" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <UserAvatar user={dispAuthor(msg.author)} size={24} className="pin-avatar-comp" />
                        <span className="pin-name" style={{ fontWeight: 600 }}>{dispAuthor(msg.author).username}</span>
                        {!dispAuthor(msg.author)._masked && <UserBadges badges={msg.author.badges} serverTag={resolveServerTag(msg.author)} size={12} />}
                        <span className="pin-date" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatDate(msg.createdAt)}</span>
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
                                  <CameraIcon size={20} color="var(--primary-neon)" />
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
          <Virtuoso
            key={dm._id}
            ref={virtuosoRef}
            scrollerRef={(el) => { scrollerElRef.current = el as HTMLElement | null; }}
            className="messages-list"
            style={{ height: '100%', width: '100%' }}
            data={messages}
            firstItemIndex={firstItemIndex}
            initialTopMostItemIndex={firstItemIndex + Math.max(0, messages.length - 1 - (initialUnreadCount > 0 ? initialUnreadCount : 0))}
            startReached={handleStartReached}
            followOutput={false}
            atBottomThreshold={120}
            atBottomStateChange={handleAtBottomStateChange}
            increaseViewportBy={{ top: 600, bottom: 300 }}
            components={{
              Header: () => (isLoadingMore ? <div className="loading-more">Загрузка...</div> : null),
              Footer: () => <div style={{ height: 8 }} />,
            }}
            computeItemKey={(_i, item) => item._id}
            itemContent={(absoluteIndex, msg) => {
              const idx = absoluteIndex - firstItemIndex;
              const prev = idx > 0 ? messages[idx - 1] : undefined;
              const showDate = shouldShowDate(msg, prev);
              const grouped = isGrouped(msg, prev);
              const isFresh = hasBaseline && idx > lastSeenIdx;

              return (
                <React.Fragment key={msg._id}>
                  {showDate && (
                    <div className="message-date-divider">
                      <span>{formatDate(msg.createdAt)}</span>
                    </div>
                  )}

                  {initialUnreadCount > 0 && idx === messages.length - initialUnreadCount && (
                    <div className="new-messages-marker" ref={unreadRef}>
                      <div className="new-messages-line" />
                      <span>Новые сообщения</span>
                      <div className="new-messages-line" />
                    </div>
                  )}

                  <DMMessageItem
                    msg={msg}
                    grouped={grouped}
                    isFresh={isFresh}
                    user={user}
                    dmId={dm._id}
                    socket={socket}
                    showPreview={showPreview}
                    showHoverBar={showHoverBar}
                    highlightMentions={highlightMentions}
                    dispAuthor={dispAuthor}
                    formatDate={formatDate}
                    renderMessageContent={renderMessageContent}
                    renderEmbed={renderEmbed}
                    handleReact={handleReact}
                    handleDownload={handleDownload}
                    handleTogglePin={handleTogglePin}
                    scrollToMessage={scrollToMessage}
                    onUserClick={onUserClick}
                    setReplyToMessage={setReplyToMessage}
                    inputRef={inputRef}
                    setShowEmojiPicker={setShowEmojiPicker}
                    setLightboxMedia={setLightboxMedia}
                    setLightboxIndex={setLightboxIndex}
                    setLightboxOpen={setLightboxOpen}
                    allMessages={messages}
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
                <ReplyIcon size={16} color="var(--primary-neon)" />
                <div className="reply-input-text">
                   <span>Ответ пользователю <strong>{dispAuthor(replyToMessage.author).username}</strong></span>
                   {!dispAuthor(replyToMessage.author)._masked && <UserBadges badges={replyToMessage.author.badges} serverTag={resolveServerTag(replyToMessage.author)} size={12} />}
                  <div className="reply-input-snippet">{replyToMessage.content || (replyToMessage.attachments?.length ? 'Вложение' : '')}</div>
                </div>
              </div>
              <button className="cancel-reply-btn" onClick={() => setReplyToMessage(null)}>×</button>
            </div>
          )}
          {attachments.length > 0 && (
            <div className="attachments-preview">
              <div className="attachments-preview-list">
                {attachments.map((att, i) => (
                  <div key={i} className="input-attachment-preview">
                    {att.type.startsWith('image/') ? (
                      <img src={getFullUrl(att.url)!} alt="" />
                    ) : (
                      <div className="file-icon"><DocumentIcon size={24} /></div>
                    )}
                    <button type="button" className="remove-attachment-btn" onClick={() => setAttachments(p => p.filter((_, idx) => idx !== i))}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                  <ArrowDownIcon size={20} />
                  <span>Новые сообщения</span>
                </button>
              )}
              {showMentions && (
                <MentionAutocomplete
                  query={mentionQuery}
                  items={friends}
                  onSelect={handleMentionSelect}
                  onClose={() => setShowMentions(false)}
                />
              )}
              <textarea
                ref={inputRef}
                rows={1}
                placeholder={maskModeration ? 'Написать модерации...' : `Написать ${otherUser?.username}...`}
                value={message}
                onChange={(e) => {
                  handleTyping(e);
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  const maxHeight = window.innerHeight * 0.3 - 24;
                  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
                }}
                onKeyDown={(e) => {
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
          </form>
        </div>
        <MediaLightbox isOpen={lightboxOpen} onClose={() => setLightboxOpen(false)} media={lightboxMedia} initialIndex={lightboxIndex} />
      </div >
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
                handleReact(showEmojiPicker.msgId, emoji);
                setShowEmojiPicker(null);
              }}
            />
          </div>
        </div>,
        document.body
      )}
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
      {attachmentsEverOpened && createPortal(
        <React.Suspense fallback={null}>
          <AttachmentsModal
            isOpen={showAttachments}
            onClose={() => setShowAttachments(false)}
            dmId={dm._id}
            title={displayName || ''}
          />
        </React.Suspense>,
        document.body
      )}
      <MessageSearchPanel
        open={showSearch}
        onClose={() => setShowSearch(false)}
        endpoint={`/api/direct-messages/${dm._id}/messages/search`}
        onJump={jumpToMessage}
      />
    </div >
  );
};

export default DMView;
