import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Socket } from 'socket.io-client';
import { Channel, Message, Server, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { HashtagIcon, DocumentIcon, PlusIcon, TrashIcon, DownloadIcon, PinIcon, ArrowDownIcon } from './Icons';
import './ChannelView.css';
import './Attachments.css';
import MemberContextMenu from './MemberContextMenu';
import CustomVideoPlayer from './CustomVideoPlayer';
import CustomAudioPlayer from './CustomAudioPlayer';
import MediaLightbox from './MediaLightbox';
import MentionAutocomplete from './MentionAutocomplete';
import { Role } from '../types';
import { computePermissions, hasPermission, Permissions } from '../utils/permissions';
import { useChatSettings } from '../contexts/ChatSettingsContext';

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
}

const MessageItem = React.memo<{
  msg: Message;
  prev: Message | undefined;
  user: User | null;
  server: Server;
  displayEmbeds: boolean;
  showHoverActions: boolean;
  mentionHighlight: boolean;
  canPin: boolean;
  onUserClick: (userId: string, event?: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, user: User) => void;
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  formatDate: (d: string) => string;
  renderMessageContent: (c: string, m?: User[]) => any;
  handleDownload: (e: React.MouseEvent, url: string, filename: string) => void;
  setLightboxMedia: (m: any[]) => void;
  setLightboxIndex: (i: number) => void;
  setLightboxOpen: (o: boolean) => void;
  allMessages: Message[];
}>(({
  msg, prev, user, server, displayEmbeds, showHoverActions, mentionHighlight, canPin,
  onUserClick, onContextMenu, onTogglePin, onDelete, formatDate, renderMessageContent,
  handleDownload, setLightboxMedia, setLightboxIndex, setLightboxOpen, allMessages
}) => {
  const shouldShowDate = (current: Message, previous: Message | undefined) => {
    if (!previous) return true;
    return new Date(current.createdAt).getDate() !== new Date(previous.createdAt).getDate();
  };

  const isGrouped = (current: Message, previous: Message | undefined) => {
    if (!previous) return false;
    if (current.author._id !== previous.author._id) return false;
    if (shouldShowDate(current, previous)) return false;
    const timeDiff = new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime();
    return timeDiff < 5 * 60 * 1000;
  };

  const showDate = shouldShowDate(msg, prev);
  const grouped = isGrouped(msg, prev);

  const member = useMemo(() =>
    server.members.find(m => String((m.user as any)._id || m.user) === String(msg.author._id)),
    [server.members, msg.author._id]
  );

  return (
    <>
      {showDate && <div className="message-date-divider"><span>{formatDate(msg.createdAt)}</span></div>}
      <div className={`message ${grouped ? 'grouped' : 'with-author'} ${mentionHighlight && msg.mentions?.some(m => m._id === user?._id) ? 'mention-highlight' : ''}`}>
        {!grouped && (
          <div className="message-author-avatar" onClick={(e) => onUserClick(msg.author._id, e)} onContextMenu={(e) => onContextMenu(e, msg.author)} style={{ cursor: 'pointer' }}>
            {getAvatarUrl(msg.author.avatar) ? <img src={getAvatarUrl(msg.author.avatar)!} alt="" /> : <span>{msg.author.username.charAt(0).toUpperCase()}</span>}
          </div>
        )}
        {grouped && <div className="message-time-mini">{new Date(msg.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>}
        <div className="message-content">
          {!grouped && (
            <div className="message-header">
              <div className="message-author-info">
                <span
                  className="message-author"
                  onClick={(e) => onUserClick(msg.author._id, e)}
                  onContextMenu={(e) => onContextMenu(e, msg.author)}
                  style={{
                    cursor: 'pointer',
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
                  {member?.nickname || msg.author.username}
                </span>
                <span className="message-time">{formatDate(msg.createdAt)}</span>
              </div>
              {showHoverActions && (
                <div className="message-actions-hover">
                  {canPin && (
                    <button
                      className="msg-action-btn"
                      onClick={() => onTogglePin(msg._id)}
                      title={msg.pinned ? "Открепить" : "Закрепить"}
                    >
                      <PinIcon size={16} fill={msg.pinned ? "var(--primary-neon)" : "none"} color={msg.pinned ? "var(--primary-neon)" : "currentColor"} />
                    </button>
                  )}
                  {(msg.author._id === user?._id || (typeof server.owner === 'object' ? (server.owner as any)._id : server.owner) === user?._id) && (
                    <button className="msg-action-btn danger" onClick={() => onDelete(msg._id)}><TrashIcon size={16} /></button>
                  )}
                </div>
              )}
            </div>
          )}

          {grouped && showHoverActions && (
            <div className="message-actions-hover mini">
              {canPin && (
                <button
                  className="msg-action-btn mini"
                  onClick={() => onTogglePin(msg._id)}
                >
                  <PinIcon size={14} fill={msg.pinned ? "var(--primary-neon)" : "none"} color={msg.pinned ? "var(--primary-neon)" : "currentColor"} />
                </button>
              )}
              {(msg.author._id === user?._id || (typeof server.owner === 'object' ? (server.owner as any)._id : server.owner) === user?._id) && (
                <button className="msg-action-btn danger mini" onClick={() => onDelete(msg._id)}><TrashIcon size={14} /></button>
              )}
            </div>
          )}

          {msg.pinned && !grouped && <div className="pinned-indicator"><PinIcon size={12} fill="var(--primary-neon)" color="var(--primary-neon)" /> Закреплено</div>}

          <div className="message-text">{renderMessageContent(msg.content, msg.mentions)}</div>
          {displayEmbeds && msg.attachments && msg.attachments.length > 0 && (
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
          {msg.edited && <span className="message-edited">(изменено)</span>}
        </div>
      </div>
    </>
  );
});

const ChannelView: React.FC<ChannelViewProps> = ({
  channel, server, messages, socket, onUserClick, initialUnreadCount = 0,
  hasMore = false, isLoadingMore = false, onLoadMore, pinnedMessages = []
}) => {
  const { user } = useAuth();
  const {
    displayEmbeds,
    showHoverActions,
    mentionHighlight,
    autocompleteEmoji,
    enableTTS
  } = useChatSettings();
  const [message, setMessage] = useState('');

  const userPermissions = useMemo(() => {
    if (!user) return 0n;
    return computePermissions(user._id, server, channel);
  }, [user, server, channel]);

  const canPin = hasPermission(userPermissions, Permissions.PIN_MESSAGES);
  const canMentionEveryone = hasPermission(userPermissions, Permissions.MENTION_EVERYONE);

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, user: User } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxMedia, setLightboxMedia] = useState<any[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const unreadRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrolledToNew, setHasScrolledToNew] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showPins, setShowPins] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const lastScrollTopRef = useRef(0);

  const handleContextMenu = (e: React.MouseEvent, user: User) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, user });
  };

  const handleMention = (username: string) => {
    setMessage((prev) => `${prev}@${username} `);
  };

  useEffect(() => {
    setHasScrolledToNew(false);
  }, [channel._id]);

  useEffect(() => {
    // Initial jump to bottom or unread
    if (messages.length > 0 && !hasScrolledToNew) {
      const scrollToTarget = () => {
        const container = scrollContainerRef.current;
        if (initialUnreadCount > 0 && unreadRef.current && container) {
          const element = unreadRef.current;
          container.scrollTop = element.offsetTop - 100;
        } else if (container) {
          container.scrollTop = container.scrollHeight;
        }
      };
      scrollToTarget();
      const t = setTimeout(scrollToTarget, 100);
      setHasScrolledToNew(true);
      return () => clearTimeout(t);
    }
  }, [channel._id, messages.length, initialUnreadCount, hasScrolledToNew]);

  useEffect(() => {
    // New messages - smooth scroll only if already near bottom
    if (hasScrolledToNew) {
      const container = scrollContainerRef.current;
      if (container) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 300;
        if (isNearBottom) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          setShowScrollBottom(true);
        }
      }
    }
  }, [messages, hasScrolledToNew]);

  // TTS Effect
  useEffect(() => {
    if (!enableTTS || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.author._id !== user?._id && hasScrolledToNew) {
      const utterance = new SpeechSynthesisUtterance(`${lastMsg.author.username} сказал: ${lastMsg.content}`);
      utterance.lang = 'ru-RU';
      window.speechSynthesis.speak(utterance);
    }
  }, [messages.length, enableTTS]);

  const handleScroll = async () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Check for "scroll to bottom" button visibility
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setShowScrollBottom(!isAtBottom);

    // Load more when reaching top
    if (container.scrollTop < 50 && hasMore && !isLoadingMore && onLoadMore) {
      const oldScrollHeight = container.scrollHeight;
      await onLoadMore();
      // Restore scroll position after loading
      if (container) {
        container.scrollTop = container.scrollHeight - oldScrollHeight;
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setShowScrollBottom(false);
  };

  const handleTogglePin = (messageId: string) => {
    axios.patch(`/api/messages/${messageId}/pin`);
  };

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
    return () => {
      socket.off('user-typing', handleTyping);
      socket.off('user-stopped-typing', handleStoppedTyping);
    };
  }, [socket, channel._id, user?._id]);

  const [attachments, setAttachments] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && attachments.length === 0) || !socket) return;
    socket.emit('send-message', { content: message.trim(), channelId: channel._id, attachments });
    setMessage('');
    setAttachments([]);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing-stop', { channelId: channel._id });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const formData = new FormData();
      for (let i = 0; i < e.target.files.length; i++) formData.append('files', e.target.files[i]);
      try {
        const response = await axios.post('/api/upload-files', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setAttachments(prev => [...prev, ...response.data]);
      } catch (error) {
        alert('Ошибка загрузки файла');
      }
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setMessage(value);

    const cursorPosition = e.target.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAtSignIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtSignIndex !== -1 && autocompleteEmoji) {
      const query = textBeforeCursor.substring(lastAtSignIndex + 1);
      // Valid query: no spaces between @ and cursor
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
    socket.emit('typing-start', { channelId: channel._id });
    typingTimeoutRef.current = setTimeout(() => { socket.emit('typing-stop', { channelId: channel._id }); }, 3000);
  };

  const handleMentionSelect = (item: User | Role) => {
    const isUser = 'username' in item;
    const name = isUser ? item.username : item.name;
    const before = message.substring(0, mentionStartIndex);

    // Find where the mention query ends (at cursor or next space)
    const after = message.substring(mentionStartIndex + mentionQuery.length + 1);

    const newMessage = `${before}@${name} ${after}`;
    setMessage(newMessage);
    setShowMentions(false);

    // Return focus to input
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const renderMessageContent = (content: string, mentions: User[] = []) => {
    if (!content) return null;
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const name = part.substring(1);
        const isUserMention = mentions.some(m => m.username === name);
        const role = server.roles?.find(r => r.name === name);
        const isSpecialMention = name === 'everyone' || name === 'here';

        if (isUserMention || role || isSpecialMention) {
          const userMention = mentions.find(m => m.username === name);
          const color = role ? role.color : (isSpecialMention ? 'var(--primary-neon)' : 'inherit');

          return (
            <span
              key={i}
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
      return part;
    });
  };

  const removeAttachment = (index: number) => setAttachments(prev => prev.filter((_, i) => i !== index));

  const handleDownload = async (e: React.MouseEvent, url: string, filename: string) => {
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
  };

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
        alert('Ошибка загрузки файла');
      }
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    if (window.confirm('Удалить это сообщение?')) {
      socket?.emit('delete-message', { messageId, channelId: channel._id });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return 'Вчера';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  };

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

  return (
    <div
      className={`channel-view ${isDragging ? 'dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="drag-drop-overlay">
          <div className="drag-drop-content">
            <div className="drag-drop-icon"><PlusIcon size={48} /></div>
            <div className="drag-drop-text">Перетащите файлы сюда для загрузки</div>
          </div>
        </div>
      )}
      <div className="channel-header">
        <div className="channel-header-info">
          <span className="channel-icon"><HashtagIcon size={24} color="#8e9297" /></span>
          <h3>{channel.name}</h3>
        </div>
        {channel.topic && <div className="channel-topic">{channel.topic}</div>}
        <div style={{ flex: 1 }} />
        <button
          className="header-action-btn"
          onClick={() => setShowPins(!showPins)}
          title="Закрепленные сообщения"
        >
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
                    <div className="pin-author">
                      <img src={getAvatarUrl(msg.author.avatar) || ''} alt="" />
                      <span className="pin-name">{msg.author.username}</span>
                      <span className="pin-date">{formatDate(msg.createdAt)}</span>
                    </div>
                    <div className="pin-content">{msg.content}</div>
                    <button className="unpin-btn" onClick={() => handleTogglePin(msg._id)}>Открепить</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="messages-container" ref={scrollContainerRef} onScroll={handleScroll}>
        {isLoadingMore && <div className="loading-more">Загрузка...</div>}
        <div className="messages-list">
          {messages.map((msg, index) => (
            <React.Fragment key={msg._id}>
              {initialUnreadCount > 0 && index === messages.length - initialUnreadCount && (
                <div className="new-messages-marker" ref={unreadRef}>
                  <div className="new-messages-line" />
                  <span>Новые сообщения</span>
                  <div className="new-messages-line" />
                </div>
              )}
              <MessageItem
                msg={msg}
                prev={messages[index - 1]}
                user={user}
                server={server}
                displayEmbeds={displayEmbeds}
                showHoverActions={showHoverActions}
                mentionHighlight={mentionHighlight}
                canPin={canPin}
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
              />
            </React.Fragment>
          ))}
          {typingUsers.size > 0 && <div className="typing-indicator">{typingUsers.size} пользователь(ей) печатает...</div>}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="message-input-container">
        {attachments.length > 0 && (
          <div className="attachments-preview">
            <div className="attachments-preview-list">
              {attachments.map((att, i) => (
                <div key={i} className="input-attachment-preview">
                  {att.type.startsWith('image/') ? <img src={getFullUrl(att.url)!} alt="" /> : <div className="file-icon"><DocumentIcon size={24} /></div>}
                  <button type="button" className="remove-attachment-btn" onClick={() => removeAttachment(i)}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="message-form">
          <button type="button" className="attachment-button" onClick={() => fileInputRef.current?.click()}><PlusIcon /></button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} multiple />
          <div style={{ flex: 1, position: 'relative' }}>
            {showScrollBottom && (
              <button className="scroll-bottom-btn" onClick={scrollToBottom}>
                <ArrowDownIcon size={20} />
                <span>Новые сообщения</span>
              </button>
            )}
            {showMentions && (
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
            )}
            <input
              ref={inputRef}
              type="text"
              placeholder={`Написать в #${channel.name}`}
              value={message}
              onChange={handleTyping}
              className="message-input"
              style={{ width: '100%' }}
            />
          </div>
          <button type="submit" className="send-button" disabled={!message.trim() && attachments.length === 0}>Отправить</button>
        </form>
      </div>
      {contextMenu && (
        <MemberContextMenu user={contextMenu.user} server={server} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} onMention={handleMention} onOpenProfile={onUserClick} />
      )}
      <MediaLightbox isOpen={lightboxOpen} onClose={() => setLightboxOpen(false)} media={lightboxMedia} initialIndex={lightboxIndex} />
    </div>
  );
};

export default ChannelView;
