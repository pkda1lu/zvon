import React, { useEffect, useRef, useState } from 'react';
import { VoicePresenceInfo } from '../contexts/VoiceContext';
import './PresenceTile.css';
import { getAvatarUrl } from '../utils/avatar';

interface Props {
    presence: VoicePresenceInfo;
    videoStream?: MediaStream;
    volume: number;
    onVolumeChange: (volume: number) => void;
    onControl: (controlId: string, value?: any) => void;
}

/**
 * Music-player-styled tile for a mini-app "voice presence".
 * Layout:
 *   - Large cover/video fills the card (16:9)
 *   - Gradient overlay from bottom for legibility
 *   - Bottom-left:  app pill (icon + displayName) above subtitle
 *   - Bottom-right: compact controls always visible
 *   - Top-right hover: volume slider
 *   - Animated equalizer bars next to app pill (visual "now playing" hint)
 */
const PresenceTile: React.FC<Props> = ({ presence, videoStream, volume, onVolumeChange, onControl }) => {
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const bgVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (!videoStream || !remoteVideoRef.current) return;
        if (remoteVideoRef.current.srcObject !== videoStream) remoteVideoRef.current.srcObject = videoStream;
        remoteVideoRef.current.play().catch(() => {});
    }, [videoStream]);

    const bg = presence.background;
    const videoUrl = !videoStream && bg?.type === 'video' && bg.url ? bg.url : null;
    // YouTube-клипы (поле videos у Я.Музыки) нельзя проиграть через <video> —
    // встраиваем iframe. Прямые видео/нативные клипы идут как обычное <video>.
    const ytMatch = videoUrl ? videoUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/) : null;
    const ytId = ytMatch ? ytMatch[1] : null;
    const directVideoUrl = videoUrl && !ytId ? videoUrl : null;
    const cover = !videoStream && !videoUrl && bg?.type === 'image' && bg.url ? bg.url : null;
    const solidBg = !videoStream && !videoUrl && bg?.type === 'color' && bg.color ? bg.color : null;
    const accent = presence.accentColor || 'var(--accent-pink, #ff00c8)';

    useEffect(() => {
        const el = bgVideoRef.current;
        if (!el || !directVideoUrl) return;
        if (el.src !== directVideoUrl) el.src = directVideoUrl;
        el.muted = true;
        el.loop = true;
        el.playsInline = true;
        el.play().catch(() => {});
    }, [directVideoUrl]);

    const tileStyle: React.CSSProperties = {
        ['--presence-accent' as any]: accent,
        ...(cover ? { backgroundImage: `url('${cover}')` } : {}),
        ...(solidBg ? { background: solidBg } : {}),
    };

    // Tiles backed by a mini-app (e.g. watch-together) act as a launcher: clicking
    // opens/restores that app's window for this member so they see the live content.
    const openApp = () => {
        if (!presence.appId) return;
        window.dispatchEvent(new CustomEvent('zvon-open-miniapp', { detail: { appId: presence.appId } }));
    };

    return (
        <div
            className={`p-card presence-card${presence.appId ? ' is-launchable' : ''}`}
            style={tileStyle}
            title={presence.appId ? 'Открыть окно мини-приложения' : undefined}
            onClick={(e) => { e.stopPropagation(); openApp(); }}
        >
            {/* Backdrop: blurred cover (for static images, gives lush colour spill) */}
            {cover && <div className="presence-cover-bg" style={{ backgroundImage: `url('${cover}')` }} />}

            {/* Live video (from publishVideo) — fills the tile */}
            {videoStream && <video ref={remoteVideoRef} className="presence-media" autoPlay playsInline muted />}

            {/* URL-based looping video background (прямой файл/нативный клип) */}
            {directVideoUrl && <video ref={bgVideoRef} className="presence-media presence-bg-video" autoPlay loop muted playsInline />}

            {/* YouTube-клип — встраиваем iframe (через <video> не играется) */}
            {ytId && (
                <iframe
                    className="presence-media presence-bg-video"
                    src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&controls=0&modestbranding=1&playsinline=1`}
                    allow="autoplay; encrypted-media"
                    frameBorder={0}
                    title="video"
                    style={{ pointerEvents: 'none', border: 0 }}
                />
            )}

            {/* Hero cover artwork (foreground square) — for static-image presences only */}
            {cover && !videoStream && !videoUrl && (
                <div className="presence-cover-hero" style={{ backgroundImage: `url('${cover}')` }} />
            )}

            {/* Dark vignette for text legibility */}
            <div className="presence-vignette" />

            {/* Top row: brand chip + volume on hover */}
            <div className="presence-top-row">
                <div className="presence-brand">
                    {presence.avatar && <img src={getAvatarUrl(presence.avatar) || undefined} alt="" />}
                    <span>{presence.displayName}</span>
                </div>

                <div className="presence-volume" title={`Громкость: ${Math.round(volume * 100)}%`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        {volume === 0 ? (
                            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 15.91 21 14 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                        ) : volume < 0.5 ? (
                            <path d="M7 9v6h4l5 5V4l-5 5H7z" />
                        ) : (
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" />
                        )}
                    </svg>
                    <input
                        type="range"
                        min={0}
                        max={200}
                        value={Math.round(volume * 100)}
                        onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            </div>

            {/* Now-playing info */}
            <div className="presence-info">
                {presence.subtitle && (
                    <div className="presence-subtitle">
                        <EqBars />
                        <span>{presence.subtitle}</span>
                    </div>
                )}
            </div>

            {/* Bottom controls bar — always visible */}
            {presence.controls && presence.controls.length > 0 && (
                <div className="presence-controls">
                    {presence.controls.map(ctrl => (
                        <PresenceControl key={ctrl.id} ctrl={ctrl} onControl={onControl} />
                    ))}
                </div>
            )}
        </div>
    );
};

/** Three animated bars — visual cue for "audio is playing here". */
const EqBars: React.FC = () => (
    <div className="presence-eq" aria-hidden>
        <span /><span /><span />
    </div>
);

/**
 * Известные иконки управления плеером — рисуем SVG вместо unicode-глифов
 * (⏮ ▶ ⏸ ⏭), у которых асимметричные метрики и они «съезжают» в кнопке.
 * Подбор идёт по id контрола, для play/pause — по текущему лейблу.
 */
const controlIcon = (ctrl: VoicePresenceInfo['controls'][number]): React.ReactNode | null => {
    const svg = (d: string) => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d={d} />
        </svg>
    );
    const label = (ctrl.label || '').trim();
    switch (ctrl.id) {
        case 'prev': return svg('M6 6h2v12H6zm3.5 6l8.5 6V6z');
        case 'next': return svg('M16 6h2v12h-2zM6 18l8.5-6L6 6z');
        case 'play-pause':
            return label === '▶'
                ? svg('M8 5v14l11-7z')
                : svg('M6 5h4v14H6zm8 0h4v14h-4z');
    }
    // Фолбэк: распознаём по самому глифу, если id нестандартный.
    if (label === '▶') return svg('M8 5v14l11-7z');
    if (label === '⏸') return svg('M6 5h4v14H6zm8 0h4v14h-4z');
    if (label === '⏮') return svg('M6 6h2v12H6zm3.5 6l8.5 6V6z');
    if (label === '⏭') return svg('M16 6h2v12h-2zM6 18l8.5-6L6 6z');
    return null;
};

const PresenceControl: React.FC<{
    ctrl: VoicePresenceInfo['controls'][number];
    onControl: Props['onControl'];
}> = ({ ctrl, onControl }) => {
    const [local, setLocal] = useState<number | null>(null);
    if (ctrl.kind === 'slider') {
        const value = local ?? ctrl.value ?? 0;
        const min = ctrl.min ?? 0;
        const max = ctrl.max ?? 100;
        const pct = ((value - min) / (max - min)) * 100;
        return (
            <div className="presence-seek" title={ctrl.tooltip || ctrl.label}>
                <div className="presence-seek-track">
                    <div className="presence-seek-fill" style={{ width: `${pct}%` }} />
                </div>
                <input
                    type="range"
                    min={min}
                    max={max}
                    value={value}
                    onChange={(e) => setLocal(Number(e.target.value))}
                    onMouseUp={(e) => { onControl(ctrl.id, Number((e.target as HTMLInputElement).value)); setLocal(null); }}
                    onTouchEnd={(e) => { onControl(ctrl.id, Number((e.target as HTMLInputElement).value)); setLocal(null); }}
                />
            </div>
        );
    }
    const styleClass = ctrl.style ? ` presence-btn-${ctrl.style}` : '';
    const icon = controlIcon(ctrl);
    return (
        <button
            className={`presence-btn${styleClass}`}
            title={ctrl.tooltip || ctrl.label}
            onClick={(e) => { e.stopPropagation(); onControl(ctrl.id); }}
        >
            {icon || ctrl.label || ctrl.id}
        </button>
    );
};

export default PresenceTile;
