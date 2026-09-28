import React, { useState } from 'react';
import CustomVideoPlayer from './CustomVideoPlayer';
import CustomAudioPlayer from './CustomAudioPlayer';
import { DocumentIcon, DownloadIcon } from './Icons';
import { getFullUrl } from '../utils/avatar';
import { getMediaKind, formatBytes } from '../utils/mediaKind';
import { downloadFile } from '../utils/transfers';

export interface AttachmentData {
    url: string;
    type: string;
    filename?: string;
    size?: number;
}

interface MessageAttachmentProps {
    att: AttachmentData;
    /** Открыть в лайтбоксе (для картинок и видео), для видео — с текущей позиции. */
    onOpenMedia?: (att: AttachmentData, startTime?: number) => void;
    iconScale?: number;
}

/**
 * Одно вложение сообщения — общее для каналов и ЛС (раньше разметка была
 * продублирована в ChannelView и DMView).
 *
 * Тип определяется по MIME, а если его нет — по расширению (utils/mediaKind).
 * Если картинка, видео или аудио не открылись (формат не поддерживается,
 * файл удалён), вложение показывается карточкой файла со скачиванием, а не
 * пустым чёрным прямоугольником. Скачивание — с прогрессом (utils/transfers).
 */
const MessageAttachment: React.FC<MessageAttachmentProps> = ({ att, onOpenMedia, iconScale = 1 }) => {
    const [failed, setFailed] = useState(false);
    // blob:/data: — локальные ссылки (превью до отправки), их не трогаем.
    const url = /^(blob|data):/i.test(att.url) ? att.url : getFullUrl(att.url)!;
    const filename = att.filename || url.split('/').pop()?.split('?')[0] || 'файл';
    const kind = failed ? 'file' : getMediaKind(att);

    const download = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        downloadFile(url, filename);
    };

    const downloadBtn = (variant: string) => (
        <button onClick={download} className={`attachment-download-btn ${variant}`} title="Скачать" aria-label="Скачать">
            <DownloadIcon size={16 * iconScale} />
        </button>
    );

    if (kind === 'image') {
        return (
            <div className="attachment-image-container">
                <img
                    src={url}
                    alt={filename}
                    loading="lazy"
                    decoding="async"
                    className="attachment-image"
                    onClick={() => onOpenMedia?.(att)}
                    onError={() => setFailed(true)}
                />
                {downloadBtn('')}
            </div>
        );
    }

    if (kind === 'video') {
        return (
            <div className="attachment-video-wrapper">
                <CustomVideoPlayer
                    src={url}
                    onExpand={onOpenMedia ? (t) => onOpenMedia(att, t) : undefined}
                    onError={() => setFailed(true)}
                />
                {downloadBtn('video')}
            </div>
        );
    }

    if (kind === 'audio') {
        return (
            <div className="attachment-audio-container">
                <CustomAudioPlayer src={url} filename={filename} onError={() => setFailed(true)} />
                {downloadBtn('audio')}
            </div>
        );
    }

    const size = formatBytes(att.size);
    return (
        <div className="attachment-file-container">
            <a href={url} target="_blank" rel="noopener noreferrer" className="attachment-file" title={filename}>
                <DocumentIcon size={18 * iconScale} />
                <span className="attachment-file-name">{filename}</span>
                {size && <span className="attachment-file-size">{size}</span>}
            </a>
            {downloadBtn('file')}
        </div>
    );
};

export default MessageAttachment;
