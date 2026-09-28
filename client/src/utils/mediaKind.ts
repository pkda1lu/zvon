/**
 * Как показывать вложение: картинкой, видео, аудио или карточкой файла.
 *
 * Раньше решение принималось только по MIME-типу, который присылает браузер
 * при загрузке. Для части файлов он пустой или «application/octet-stream»
 * (.mov с iPhone, .webm, .opus, .heic из некоторых систем) — такие вложения
 * показывались карточкой файла вместо плеера или картинки. Теперь при
 * неопределённом MIME смотрим на расширение.
 *
 * Форматы, которые движок браузера не умеет проигрывать (mkv, avi, heic),
 * здесь относятся к своей группе, а сам плеер/картинка при ошибке загрузки
 * откатывается на карточку файла (см. MessageAttachment).
 */
export type MediaKind = 'image' | 'video' | 'audio' | 'file';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico|heic|heif)$/i;
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv|mkv|avi|3gp)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac|weba)$/i;

export interface AttachmentLike {
    type?: string | null;
    filename?: string | null;
    url?: string | null;
}

export const getMediaKind = (att: AttachmentLike): MediaKind => {
    const mime = String(att.type || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    const name = String(att.filename || att.url || '').split('?')[0];
    if (IMAGE_EXT.test(name)) return 'image';
    if (VIDEO_EXT.test(name)) return 'video';
    if (AUDIO_EXT.test(name)) return 'audio';
    return 'file';
};

/** Картинки и видео — то, что листается в лайтбоксе. */
export const isVisualMedia = (att: AttachmentLike) => {
    const kind = getMediaKind(att);
    return kind === 'image' || kind === 'video';
};

/** «12,4 МБ» — для карточек файлов и передачи файлов. */
export const formatBytes = (bytes?: number | null): string => {
    if (!bytes || bytes <= 0 || !isFinite(bytes)) return '';
    const units = ['Б', 'КБ', 'МБ', 'ГБ'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    const digits = v >= 100 || i === 0 ? 0 : 1;
    return `${v.toFixed(digits).replace('.', ',')} ${units[i]}`;
};
