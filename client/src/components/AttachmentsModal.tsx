import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import AnimatedOverlay from '../animations/AnimatedOverlay';
import { Message, User } from '../types';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { 
  DownloadIcon, 
  DocumentIcon, 
  SpeakerIcon, 
  VideoIcon, 
  ImageIcon,
  CloseIcon,
  EllipsisIcon
} from './Icons';
import MediaLightbox from './MediaLightbox';
import { getMediaKind } from '../utils/mediaKind';
import { downloadFile } from '../utils/transfers';
import './AttachmentsModal.css';

interface AttachmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId?: string;
  dmId?: string;
  title: string;
}

interface AttachmentItem {
  url: string;
  filename: string;
  size: number;
  type: string;
  createdAt: string;
  author: User;
  messageId: string;
}

const AttachmentsModal: React.FC<AttachmentsModalProps> = ({ isOpen, onClose, channelId, dmId, title }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'images' | 'videos' | 'audio' | 'files'>('all');
  const [lightbox, setLightbox] = useState<{ media: AttachmentItem[]; index: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchAttachments();
    }
  }, [isOpen, channelId, dmId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Пока открыт просмотрщик, Esc закрывает только его.
      if (e.key === 'Escape' && isOpen && !lightbox) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, lightbox]);

  const fetchAttachments = async () => {
    setIsLoading(true);
    try {
      const endpoint = channelId 
        ? `/api/messages/channel/${channelId}/attachments` 
        : `/api/messages/dm/${dmId}/attachments`;
      const response = await axios.get(endpoint);
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to fetch attachments', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Тип — тем же правилом, что у вложений в сообщениях (utils/mediaKind).
  const getAttachmentType = (filename: string, contentType: string): 'images' | 'videos' | 'audio' | 'files' => {
    const kind = getMediaKind({ filename, type: contentType });
    return kind === 'image' ? 'images' : kind === 'video' ? 'videos' : kind === 'audio' ? 'audio' : 'files';
  };

  const allAttachments = useMemo(() => {
    const list: AttachmentItem[] = [];
    messages.forEach(msg => {
      msg.attachments.forEach(att => {
        list.push({
          ...att,
          createdAt: msg.createdAt,
          author: msg.author,
          messageId: msg._id
        });
      });
    });
    return list;
  }, [messages]);

  const filteredAttachments = useMemo(() => {
    if (activeTab === 'all') return allAttachments;
    return allAttachments.filter(att => getAttachmentType(att.filename, att.type) === activeTab);
  }, [allAttachments, activeTab]);

  const groupedByDate = useMemo(() => {
    const groups: { [date: string]: { [type: string]: AttachmentItem[] } } = {};
    
    filteredAttachments.forEach(att => {
      const date = new Date(att.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      const type = getAttachmentType(att.filename, att.type);
      
      if (!groups[date]) groups[date] = {};
      if (!groups[date][type]) groups[date][type] = [];
      groups[date][type].push(att);
    });

    return groups;
  }, [filteredAttachments]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  /**
   * Клик по карточке: фото и видео открываются в просмотрщике (листаются все
   * картинки и видео текущего списка, там же «Скачать»), аудио и остальные
   * файлы скачиваются с прогрессом (utils/transfers).
   */
  const openCard = (att: AttachmentItem, type: string) => {
    if (type === 'images' || type === 'videos') {
      const media = filteredAttachments.filter(a => {
        const t = getAttachmentType(a.filename, a.type);
        return t === 'images' || t === 'videos';
      });
      setLightbox({ media, index: Math.max(0, media.indexOf(att)) });
      return;
    }
    downloadFile(getFullUrl(att.url) || att.url, att.filename);
  };

  return (
    <AnimatedOverlay
      isOpen={isOpen}
      onClose={onClose}
      overlayClassName="attachments-modal-overlay"
      contentClassName="attachments-modal-container glass-panel-base"
    >
      <div style={{ display: 'contents' }}>
        <div className="attachments-sidebar">
          <div className="sidebar-title">
             <span>ВЛОЖЕНИЯ</span>
             <h2>{title}</h2>
          </div>

          <div className="sidebar-header">КАТЕГОРИИ</div>
          <div className={`sidebar-item ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
            <EllipsisIcon size={20} />
            <span>Все вложения</span>
          </div>
          <div className={`sidebar-item ${activeTab === 'images' ? 'active' : ''}`} onClick={() => setActiveTab('images')}>
            <ImageIcon size={20} />
            <span>Фотографии</span>
          </div>
          <div className={`sidebar-item ${activeTab === 'videos' ? 'active' : ''}`} onClick={() => setActiveTab('videos')}>
            <VideoIcon size={20} />
            <span>Видеофайлы</span>
          </div>
          <div className={`sidebar-item ${activeTab === 'audio' ? 'active' : ''}`} onClick={() => setActiveTab('audio')}>
            <SpeakerIcon size={20} />
            <span>Аудиозаписи</span>
          </div>
          <div className={`sidebar-item ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
            <DocumentIcon size={20} />
            <span>Документы</span>
          </div>


        </div>

        <div className="attachments-main-content">
           <div className="attachments-content-header">
              <div className="header-info">
                 <h2>{activeTab === 'all' ? 'Все вложения' : activeTab === 'images' ? 'Фотографии' : activeTab === 'videos' ? 'Видеофайлы' : activeTab === 'audio' ? 'Аудиозаписи' : 'Документы'}</h2>
                 <p>{filteredAttachments.length} объектов найдено</p>
              </div>
              <div className="close-x-btn" onClick={onClose}>
                <div className="close-circle"><CloseIcon size={20} /></div>
                <span className="close-text">ESC</span>
              </div>
           </div>

           <div className="attachments-scroll-area">
              {isLoading ? (
                <div className="loading-state">
                   <div className="spinner"></div>
                   <span>Загрузка медиаархива...</span>
                </div>
              ) : filteredAttachments.length === 0 ? (
                <div className="empty-state">
                   <DocumentIcon size={48} color="rgba(255, 255, 255, 0.2)" />
                   <h3>Здесь ничего нет</h3>
                   <p>В этом чате пока не делились такими вложениями</p>
                </div>
              ) : (
                Object.entries(groupedByDate).map(([date, typeGroups]) => (
                  <div key={date} className="date-group">
                    <div className="date-header">{date}</div>
                    {Object.entries(typeGroups).map(([type, items]) => (
                      <div key={type} className="type-group">
                        <div className="attachments-grid">
                          {items.map((att, idx) => (
                            <div
                              key={`${att.messageId}-${idx}`}
                              className={`attachment-card ${type === 'images' || type === 'videos' ? 'is-media' : 'is-file'}`}
                              role="button"
                              tabIndex={0}
                              title={type === 'images' || type === 'videos' ? 'Открыть' : 'Скачать'}
                              onClick={() => openCard(att, type)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(att, type); } }}
                            >
                              <div className="card-preview">
                                {type === 'images' ? (
                                  <img src={getFullUrl(att.url) || ''} alt={att.filename} loading="lazy" />
                                ) : type === 'videos' ? (
                                  <>
                                    {/* #t=0.1 — показать первый кадр вместо чёрного прямоугольника. */}
                                    <video src={`${getFullUrl(att.url) || ''}#t=0.1`} preload="metadata" muted playsInline />
                                    <div className="card-play-badge"><VideoIcon size={18} /></div>
                                  </>
                                ) : type === 'audio' ? (
                                  <div className="audio-icon"><SpeakerIcon size={40} /></div>
                                ) : (
                                  <div className="file-icon"><DocumentIcon size={40} /></div>
                                )}
                                {/* Значок скачивания — только у аудио и файлов: фото и видео открываются, скачать их можно в просмотрщике. */}
                                {type !== 'images' && type !== 'videos' && (
                                  <div className="card-overlay">
                                    <span className="download-btn" aria-hidden="true"><DownloadIcon size={22} /></span>
                                  </div>
                                )}
                              </div>
                              <div className="card-info">
                                <span className="file-name" title={att.filename}>{att.filename}</span>
                                <div className="file-footer">
                                   <span className="file-size">{formatSize(att.size)}</span>
                                   <span className="file-author">от {att.author.displayName || att.author.username}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
           </div>
        </div>
      </div>
      <MediaLightbox
        isOpen={!!lightbox}
        onClose={() => setLightbox(null)}
        media={lightbox?.media || []}
        initialIndex={lightbox?.index || 0}
      />
    </AnimatedOverlay>
  );
};

export default AttachmentsModal;
