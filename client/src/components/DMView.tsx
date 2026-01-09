import React, { useState, useRef, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { DirectMessage, Message, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { PhoneIcon, DocumentIcon, PlusIcon } from './Icons';
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
  onUserClick: (userId: string) => void;
}

const DMView: React.FC<DMViewProps> = ({ dm, messages, socket, onClose, onStartCall, onUserClick }) => {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxMedia, setLightboxMedia] = useState<any[]>([]);

  const otherUser = dm.participants.find(p => p._id !== user?._id);

  useEffect(() => {
    const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' }); };
    scrollToBottom();
    // Small timeout to ensure images/layout loaded, but keep it auto for instant jump
    const t = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(t);
  }, [dm._id]); // Only on DM change, not every message to allow scrolling up to read history? 
  // Actually, standard behavior is scroll on new message if at bottom. 
  // But request is specific about "opening".

  useEffect(() => {
    // On new messages, we usually scroll to bottom if we were already there or it's a new message from self.
    // For simplicity and per request "always open last read" (interpreting as "latest"), let's auto-scroll.
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, attachments]);

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

  const formatDate = (ds: string) => {
    const d = new Date(ds); const now = new Date(); const diff = now.getTime() - d.getTime(); const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  };

  const shouldShowDate = (cur: Message, prev: Message | undefined) => !prev || new Date(cur.createdAt).getDate() !== new Date(prev.createdAt).getDate();

  return (
    <div className="dm-view">
      <div className="dm-header">
        <button className="back-button" onClick={onClose}>←</button>
        <div className="dm-header-info" onClick={() => otherUser && onUserClick(otherUser._id)} style={{ cursor: 'pointer' }}>
          <div className="dm-avatar">{getAvatarUrl(otherUser?.avatar) ? <img src={getAvatarUrl(otherUser?.avatar)!} alt="" /> : <span>{otherUser?.username.charAt(0).toUpperCase()}</span>}<div className={`status-indicator ${otherUser?.status}`}></div></div>
          <h3>{otherUser?.username}</h3>
        </div>
        <button className="voice-call-button" onClick={() => otherUser && onStartCall(otherUser, dm._id)} title="Начать голосовой звонок"><PhoneIcon /></button>
      </div>
      <div className="messages-container">
        <div className="messages-list">
          {messages.map((msg, idx) => (
            <React.Fragment key={msg._id}>
              {shouldShowDate(msg, messages[idx - 1]) && <div className="message-date-divider"><span>{formatDate(msg.createdAt)}</span></div>}
              {msg.type === 'missed-call' ? (
                <div className="message system-message missed-call"><div className="system-message-icon"><PhoneIcon color="#f23f43" /></div><div className="system-message-content"><div className="system-message-header"><span className="message-author" onClick={() => onUserClick(msg.author._id)}>{msg.author.username}</span><span className="message-time">{formatDate(msg.createdAt)}</span></div><div className="system-message-text">Пропущенный звонок</div></div></div>
              ) : (
                <div className="message with-author">
                  <div className="message-author-avatar" onClick={() => onUserClick(msg.author._id)} style={{ cursor: 'pointer' }}>{getAvatarUrl(msg.author.avatar) ? <img src={getAvatarUrl(msg.author.avatar)!} alt="" /> : <span>{msg.author.username.charAt(0).toUpperCase()}</span>}</div>
                  <div className="message-content">
                    <div className="message-header"><span className="message-author" onClick={() => onUserClick(msg.author._id)} style={{ cursor: 'pointer' }}>{msg.author.username}</span><span className="message-time">{formatDate(msg.createdAt)}</span></div>
                    <div className="message-text">{msg.content}</div>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="message-attachments">
                        {msg.attachments.map((att, i) => (
                          <div key={i} className="attachment-item">
                            {att.type.startsWith('image/') ? (
                              <img src={getFullUrl(att.url)!} alt="" className="attachment-image" onClick={() => {
                                const allMedia = messages.flatMap(m => m.attachments || []).filter(a => a.type.startsWith('image/') || a.type.startsWith('video/'));
                                setLightboxMedia(allMedia); setLightboxIndex(allMedia.findIndex(a => a.url === att.url)); setLightboxOpen(true);
                              }} />
                            ) : att.type.startsWith('video/') ? (
                              <div className="attachment-video-wrapper" style={{ width: '100%', maxWidth: '500px' }}>
                                <CustomVideoPlayer src={getFullUrl(att.url)!} onExpand={(currentTime) => {
                                  const allMedia = messages.flatMap(m => m.attachments || []).filter(a => a.type.startsWith('image/') || a.type.startsWith('video/')).map(a => ({ ...a }));
                                  const idx = allMedia.findIndex(a => a.url === att.url); if (idx !== -1) (allMedia[idx] as any).startTime = currentTime;
                                  setLightboxMedia(allMedia); setLightboxIndex(idx); setLightboxOpen(true);
                                }} />
                              </div>
                            ) : (att.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(att.filename || '')) ? (
                              <CustomAudioPlayer src={getFullUrl(att.url)!} filename={att.filename} />
                            ) : (
                              <a href={getFullUrl(att.url)!} target="_blank" rel="noopener noreferrer" className="attachment-file"><DocumentIcon size={18} /><span>{att.filename}</span></a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="message-input-container">
        {attachments.length > 0 && <div className="attachments-preview"><div className="attachments-preview-list">{attachments.map((att, i) => (<div key={i} className="input-attachment-preview">{att.type.startsWith('image/') ? <img src={getFullUrl(att.url)!} alt="" /> : <div className="file-icon"><DocumentIcon size={24} /></div>}<button type="button" className="remove-attachment-btn" onClick={() => setAttachments(p => p.filter((_, idx) => idx !== i))}>×</button></div>))}</div></div>}
        <form onSubmit={handleSendMessage} className="message-form">
          <button type="button" className="attachment-button" onClick={() => fileInputRef.current?.click()}><PlusIcon /></button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} multiple />
          <input type="text" placeholder={`Написать ${otherUser?.username}...`} value={message} onChange={e => setMessage(e.target.value)} className="message-input" />
          <button type="submit" className="send-button" disabled={!message.trim() && attachments.length === 0}>Отправить</button>
        </form>
      </div>
      <MediaLightbox isOpen={lightboxOpen} onClose={() => setLightboxOpen(false)} media={lightboxMedia} initialIndex={lightboxIndex} />
    </div>
  );
};

export default DMView;
