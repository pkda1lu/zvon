import React, { useState, useRef, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { Channel, Message } from '../types';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import './ChannelView.css';
import './Attachments.css';

interface ChannelViewProps {
  channel: Channel;
  messages: Message[];
  socket: Socket | null;
}

const ChannelView: React.FC<ChannelViewProps> = ({ channel, messages, socket }) => {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

    socket.emit('send-message', {
      content: message.trim(),
      channelId: channel._id,
      attachments
    });

    setMessage('');
    setAttachments([]);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    socket.emit('typing-stop', { channelId: channel._id });
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

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);

    if (!socket) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    socket.emit('typing-start', { channelId: channel._id });

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing-stop', { channelId: channel._id });
    }, 3000);
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
    } else if (days < 7) {
      return date.toLocaleDateString('ru-RU', { weekday: 'long' });
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
    <div className="channel-view">
      <div className="channel-header">
        <div className="channel-header-info">
          <span className="channel-icon">#</span>
          <h3>{channel.name}</h3>
        </div>
        {channel.topic && (
          <div className="channel-topic">{channel.topic}</div>
        )}
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
                    {msg.edited && (
                      <span className="message-edited">(изменено)</span>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          {typingUsers.size > 0 && (
            <div className="typing-indicator">
              {Array.from(typingUsers).length} пользователь(ей) печатает...
            </div>
          )}
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
            placeholder={`Написать в #${channel.name}`}
            value={message}
            onChange={handleTyping}
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

export default ChannelView;

