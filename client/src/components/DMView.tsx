import React, { useState, useRef, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { DirectMessage, Message, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { PhoneIcon, DocumentIcon, PlusIcon, DownloadIcon } from './Icons';
import VoiceCall from './VoiceCall';
import CustomVideoPlayer from './CustomVideoPlayer';
import CustomAudioPlayer from './CustomAudioPlayer';
import MediaLightbox from './MediaLightbox';
import './DMView.css';
import './Attachments.css';

interface DMViewProps {
  dm: DirectMessage;
  messages: Message[];
  socket: Socket | null;
  onClose: () => void;
  onStartCall: (user: User, dmId: string) => void;
  onUserClick: (userId: string, event?: React.MouseEvent) => void;
  initialUnreadCount?: number;
}

const DMView: React.FC<DMViewProps> = ({ dm, messages, socket, onClose, onStartCall, onUserClick, initialUnreadCount = 0 }) => {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const unreadRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxMedia, setLightboxMedia] = useState<any[]>([]);
  const [hasScrolledToNew, setHasScrolledToNew] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const otherUser = dm.participants.find(p => p._id !== user?._id);

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    if (isToday) return `Сегодня в ${timeStr}`;
    if (isYesterday) return `Вчера в ${timeStr}`;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && attachments.length === 0) || !socket) return;
    socket.emit('send-message', { content: message.trim(), dmId: dm._id, attachments });
    setMessage('');
    setAttachments([]);
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
      } catch (error) { alert('Ошибка загрузки файла'); }
    }
  };

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
  useEffect(() => {
    setHasScrolledToNew(false);
  }, [dm._id]);

  useEffect(() => {
    if (messages.length > 0 && !hasScrolledToNew) {
      const scrollToTarget = () => {
        if (initialUnreadCount > 0 && unreadRef.current) {
          unreadRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
        } else if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      };
      scrollToTarget();
      const t = setTimeout(scrollToTarget, 50);
      setHasScrolledToNew(true);
      return () => clearTimeout(t);
    }
  }, [dm._id, messages.length, initialUnreadCount, hasScrolledToNew]);

  useEffect(() => {
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

  return (
    <div
      className={`dm-view ${isDragging ? 'dragging' : ''}`}
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
      <div className="dm-container">
        <div className="dm-header">
          <button className="back-button" onClick={onClose} title="Назад">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>

          <div className="dm-header-info" onClick={(e) => otherUser && onUserClick(otherUser._id, e)} style={{ cursor: 'pointer' }}>
            <div className="dm-avatar">
              {getAvatarUrl(otherUser?.avatar) ? (
                <img src={getAvatarUrl(otherUser?.avatar)!} alt="" />
              ) : (
                <span>{otherUser?.username.charAt(0).toUpperCase()}</span>
              )}
              <div className={`status-indicator ${otherUser?.status}`}></div>
            </div>
            <div>
              <h3>{otherUser?.username}</h3>
              <div style={{ fontSize: '12px', color: 'var(--primary-neon)', fontWeight: 600, opacity: 0.8 }}>
                {otherUser?.status === 'online' ? 'В сети' : otherUser?.status === 'away' ? 'Нет на месте' : otherUser?.status === 'busy' ? 'Занят' : 'Не в сети'}
              </div>
            </div>
          </div>

          <button className="voice-call-button" onClick={() => otherUser && onStartCall(otherUser, dm._id)} title="Начать голосовой звонок">
            <PhoneIcon />
          </button>
        </div>

        <div className="messages-container" ref={scrollContainerRef}>
          <div className="messages-list">
            {messages.map((msg, idx) => {
              const prev = messages[idx - 1];
              const showDate = shouldShowDate(msg, prev);
              const grouped = isGrouped(msg, prev);

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

                  {msg.type === 'missed-call' ? (
                    <div className="message system-message missed-call">
                      <div className="system-message-icon">
                        <PhoneIcon color="#ff4d4d" />
                      </div>
                      <div className="system-message-content" style={{ marginLeft: '15px' }}>
                        <div className="system-message-header">
                          <span className="message-author" onClick={(e) => onUserClick(msg.author._id, e)} style={{ cursor: 'pointer' }}>{msg.author.username}</span>
                          <span className="message-time">{formatDate(msg.createdAt)}</span>
                        </div>
                        <div className="system-message-text">Пропущенный звонок</div>
                      </div>
                    </div>
                  ) : (
                    <div className={`message ${grouped ? 'grouped' : 'with-author'}`}>
                      {!grouped && (
                        <div className="message-author-avatar" onClick={(e) => onUserClick(msg.author._id, e)} style={{ cursor: 'pointer' }}>
                          {getAvatarUrl(msg.author.avatar) ? (
                            <img src={getAvatarUrl(msg.author.avatar)!} alt="" />
                          ) : (
                            <span>{msg.author.username.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                      )}
                      {grouped && <div className="message-time-mini">{new Date(msg.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>}
                      <div className="message-content">
                        {!grouped && (
                          <div className="message-header">
                            <span className="message-author" onClick={(e) => onUserClick(msg.author._id, e)} style={{ cursor: 'pointer' }}>{msg.author.username}</span>
                            <span className="message-time">{formatDate(msg.createdAt)}</span>
                          </div>
                        )}
                        <div className="message-text">{msg.content}</div>

                        {msg.attachments && msg.attachments.length > 0 && (
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
                                        const allMedia = messages.flatMap(m => m.attachments || []).filter(a => a.type.startsWith('image/') || a.type.startsWith('video/'));
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
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="message-input-container">
          {attachments.length > 0 && (
            <div className="attachments-preview">
              <div className="attachments-preview-list" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '16px 16px 0 0' }}>
                {attachments.map((att, i) => (
                  <div key={i} className="input-attachment-preview" style={{ borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
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
          <form onSubmit={handleSendMessage} className="message-form" style={attachments.length > 0 ? { borderRadius: '0 0 20px 20px', borderTop: 'none' } : {}}>
            <button type="button" className="attachment-button" onClick={() => fileInputRef.current?.click()}>
              <PlusIcon />
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} multiple />
            <input
              type="text"
              placeholder={`Написать ${otherUser?.username}...`}
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="message-input"
            />
            <button type="submit" className="send-button" disabled={!message.trim() && attachments.length === 0}>
              Отправить
            </button>
          </form>
        </div>
        <MediaLightbox isOpen={lightboxOpen} onClose={() => setLightboxOpen(false)} media={lightboxMedia} initialIndex={lightboxIndex} />
      </div>
    </div>
  );
};

export default DMView;
