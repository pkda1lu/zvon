import React, { useState, useRef, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { Channel, Message, Server, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { HashtagIcon, DocumentIcon, PlusIcon, TrashIcon, DownloadIcon } from './Icons';
import './ChannelView.css';
import './Attachments.css';
import MemberContextMenu from './MemberContextMenu';
import CustomVideoPlayer from './CustomVideoPlayer';
import CustomAudioPlayer from './CustomAudioPlayer';
import MediaLightbox from './MediaLightbox';

interface ChannelViewProps {
  channel: Channel;
  server: Server;
  messages: Message[];
  socket: Socket | null;
  onUserClick: (userId: string, event?: React.MouseEvent) => void;
  initialUnreadCount?: number;
}

const ChannelView: React.FC<ChannelViewProps> = ({ channel, server, messages, socket, onUserClick, initialUnreadCount = 0 }) => {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
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
        if (initialUnreadCount > 0 && unreadRef.current) {
          unreadRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
        } else {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
        }
      };
      scrollToTarget();
      // Second attempt to ensure everything is rendered
      const t = setTimeout(scrollToTarget, 50);
      setHasScrolledToNew(true);
      return () => clearTimeout(t);
    }
  }, [channel._id, messages.length, initialUnreadCount, hasScrolledToNew]);

  useEffect(() => {
    // New messages - smooth scroll only if already near bottom
    if (hasScrolledToNew) {
      const container = scrollContainerRef.current;
      if (container) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
        if (isNearBottom) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      }
    }
  }, [messages, hasScrolledToNew]);

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
    setMessage(e.target.value);
    if (!socket) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing-start', { channelId: channel._id });
    typingTimeoutRef.current = setTimeout(() => { socket.emit('typing-stop', { channelId: channel._id }); }, 3000);
  };

  const removeAttachment = (index: number) => setAttachments(prev => prev.filter((_, i) => i !== index));

  const handleDownload = async (e: React.MouseEvent, url: string, filename: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const response = await fetch(url);
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
      // Fallback
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
      </div>

      <div className="messages-container" ref={scrollContainerRef}>
        <div className="messages-list">
          {messages.map((msg, index) => {
            const prev = messages[index - 1];
            const showDate = shouldShowDate(msg, prev);
            const grouped = isGrouped(msg, prev);

            return (
              <React.Fragment key={msg._id}>
                {showDate && <div className="message-date-divider"><span>{formatDate(msg.createdAt)}</span></div>}
                {initialUnreadCount > 0 && index === messages.length - initialUnreadCount && (
                  <div className="new-messages-marker" ref={unreadRef}>
                    <div className="new-messages-line" />
                    <span>Новые сообщения</span>
                    <div className="new-messages-line" />
                  </div>
                )}
                <div className={`message ${grouped ? 'grouped' : 'with-author'}`}>
                  {!grouped && (
                    <div className="message-author-avatar" onClick={(e) => onUserClick(msg.author._id, e)} onContextMenu={(e) => handleContextMenu(e, msg.author)} style={{ cursor: 'pointer' }}>
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
                            onContextMenu={(e) => handleContextMenu(e, msg.author)}
                            style={{
                              cursor: 'pointer',
                              color: (() => {
                                const member = server.members.find(m => String((m.user as any)._id || m.user) === String(msg.author._id));
                                if (!member) return 'inherit';
                                const roleIds = member.roles || [];
                                const roles = (server.roles || []).filter(r => roleIds.includes(r._id));
                                roles.sort((a, b) => (b.position || 0) - (a.position || 0));
                                const colorRole = roles.find(r => r.color && r.color !== '#99AAB5' && r.color !== '#99aab5');
                                return colorRole ? colorRole.color : 'inherit';
                              })()
                            }}
                          >
                            {server.members.find(m => String((m.user as any)._id || m.user) === String(msg.author._id))?.nickname || msg.author.username}
                          </span>
                          <span className="message-time">{formatDate(msg.createdAt)}</span>
                        </div>
                        <div className="message-actions-hover">
                          {(msg.author._id === user?._id || (typeof server.owner === 'object' ? (server.owner as any)._id : server.owner) === user?._id) && (
                            <button className="msg-action-btn danger" onClick={() => handleDeleteMessage(msg._id)}><TrashIcon size={16} /></button>
                          )}
                        </div>
                      </div>
                    )}

                    {grouped && (
                      <div className="message-actions-hover mini">
                        {(msg.author._id === user?._id || (typeof server.owner === 'object' ? (server.owner as any)._id : server.owner) === user?._id) && (
                          <button className="msg-action-btn danger mini" onClick={() => handleDeleteMessage(msg._id)}><TrashIcon size={14} /></button>
                        )}
                      </div>
                    )}

                    <div className="message-text">{msg.content}</div>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="message-attachments">
                        {msg.attachments.map((att, i) => (
                          <div key={i} className="attachment-item">
                            {att.type.startsWith('image/') ? (
                              <div className="attachment-image-container">
                                <img src={getFullUrl(att.url)!} alt="" className="attachment-image" onClick={() => {
                                  const allMedia = messages.flatMap(m => m.attachments || []).filter(a => a.type.startsWith('image/') || a.type.startsWith('video/'));
                                  setLightboxMedia(allMedia);
                                  setLightboxIndex(allMedia.findIndex(a => a.url === att.url));
                                  setLightboxOpen(true);
                                }} />
                                <button onClick={(e) => handleDownload(e, getFullUrl(att.url)!, att.filename)} className="attachment-download-btn" title="Скачать">
                                  <DownloadIcon size={16} />
                                </button>
                              </div>
                            ) : att.type.startsWith('video/') ? (
                              <div className="attachment-video-wrapper" style={{ width: '100%', maxWidth: '500px' }}>
                                <CustomVideoPlayer src={getFullUrl(att.url)!} onExpand={(currentTime) => {
                                  const allMedia = messages.flatMap(m => m.attachments || []).filter(a => a.type.startsWith('image/') || a.type.startsWith('video/')).map(a => ({ ...a }));
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
              </React.Fragment>
            );
          })}
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
          <input type="text" placeholder={`Написать в #${channel.name}`} value={message} onChange={handleTyping} className="message-input" />
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
