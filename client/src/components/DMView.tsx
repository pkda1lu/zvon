import React, { useState, useRef, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { DirectMessage, Message, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import VoiceCall from './VoiceCall';
import './DMView.css';
import './Attachments.css';

interface DMViewProps {
  dm: DirectMessage;
  messages: Message[];
  socket: Socket | null;
  onClose: () => void;
  onStartCall: (user: User) => void;
}

const DMView: React.FC<DMViewProps> = ({ dm, messages, socket, onClose, onStartCall }) => {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const otherUser = dm.participants.find(p => p._id !== user?._id);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, attachments]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && attachments.length === 0) || !socket) return;

    // Emit via socket for real-time
    socket.emit('send-message', {
      content: message.trim(),
      dmId: dm._id,
      attachments
    });

    setMessage('');
    setAttachments([]);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (socket) {
      socket.emit('typing-stop', { dmId: dm._id });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const formData = new FormData();
      for (let i = 0; i < e.target.files.length; i++) {
        formData.append('files', e.target.files[i]);
      }

      try {
        const response = await axios.post('/api/upload-files', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        setAttachments(prev => [...prev, ...response.data]);
      } catch (error) {
        console.error('Error uploading file:', error);
        alert('Ошибка загрузки файла');
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Вчера';
    } else {
      return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    }
  };

  const shouldShowDate = (current: Message, previous: Message | undefined) => {
    if (!previous) return true;
    const currentDate = new Date(current.createdAt);
    const previousDate = new Date(previous.createdAt);
    return currentDate.getDate() !== previousDate.getDate();
  };

  const shouldShowAuthor = () => {
    // Always show author for each message
    return true;
  };

  return (
    <div className="dm-view">
      <div className="dm-header">
        <button className="back-button" onClick={onClose}>←</button>
        <div className="dm-header-info">
          <div className="dm-avatar">
            {getAvatarUrl(otherUser?.avatar) ? (
              <img src={getAvatarUrl(otherUser?.avatar)!} alt={otherUser?.username} />
            ) : (
              <span>{otherUser?.username.charAt(0).toUpperCase()}</span>
            )}
            <div className={`status-indicator ${otherUser?.status}`}></div>
          </div>
          <h3>{otherUser?.username}</h3>
        </div>
        <button
          className="voice-call-button"
          onClick={() => otherUser && onStartCall(otherUser)}
          title="Начать голосовой звонок"
        >
          📞
        </button>
      </div>

      <div className="messages-container">
        <div className="messages-list">
          {messages.map((msg, index) => {
            const showDate = shouldShowDate(msg, messages[index - 1]);
            const showAuthor = shouldShowAuthor();

            return (
              <React.Fragment key={msg._id}>
                {showDate && (
                  <div className="message-date-divider">
                    <span>{formatDate(msg.createdAt)}</span>
                  </div>
                )}
                <div className="message with-author">
                  <div className="message-author-avatar">
                    {getAvatarUrl(msg.author.avatar) ? (
                      <img src={getAvatarUrl(msg.author.avatar)!} alt={msg.author.username} />
                    ) : (
                      <span>{msg.author.username.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="message-content">
                    <div className="message-header">
                      <span className="message-author">{msg.author.username}</span>
                      <span className="message-time">{formatDate(msg.createdAt)}</span>
                    </div>
                    <div className="message-text">{msg.content}</div>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="message-attachments">
                        {msg.attachments.map((att, i) => (
                          <div key={i} className="attachment-item">
                            {att.type.startsWith('image/') ? (
                              <img src={getFullUrl(att.url)!} alt={att.filename} className="attachment-image" />
                            ) : att.type.startsWith('video/') ? (
                              <video src={getFullUrl(att.url)!} controls className="attachment-video" />
                            ) : (
                              <a href={getFullUrl(att.url)!} target="_blank" rel="noopener noreferrer" className="attachment-file">
                                📄 {att.filename}
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="message-input-container">
        {attachments.length > 0 && (
          <div className="attachments-preview">
            {attachments.length} файл(ов) прикреплено
          </div>
        )}
        <form onSubmit={handleSendMessage} className="message-form">
          <button
            type="button"
            className="attachment-button"
            onClick={() => fileInputRef.current?.click()}
          >
            +
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            style={{ display: 'none' }}
            multiple
          />
          <input
            type="text"
            placeholder={`Написать ${otherUser?.username}...`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="message-input"
          />
          <button type="submit" className="send-button" disabled={!message.trim() && attachments.length === 0}>
            Отправить
          </button>
        </form>
      </div>
    </div>
  );
};

export default DMView;

