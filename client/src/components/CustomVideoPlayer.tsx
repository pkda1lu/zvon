import React, { useCallback, useEffect, useRef, useState } from 'react';
import './CustomVideoPlayer.css';
import { PlayIcon, PauseIcon, FullscreenIcon, ExpandIcon } from './Icons';
import { SeekBar, VolumeControl, formatTime, useMediaTime } from './MediaControls';

interface CustomVideoPlayerProps {
    src: string;
    /** Развернуть в лайтбокс — с текущей позицией, чтобы продолжить с того же места. */
    onExpand?: (currentTime: number) => void;
    /** Файл не воспроизводится (неподдерживаемый формат, битая ссылка). */
    onError?: () => void;
    autoPlay?: boolean;
    className?: string;
    startTime?: number;
    /** Плеер внутри лайтбокса: крупнее, без кнопки «развернуть». */
    isExpandedView?: boolean;
}

const SPEEDS = [1, 1.25, 1.5, 2, 0.75];
const HIDE_DELAY = 2200;

/**
 * Видеоплеер Zvon. Берёт собственные пропорции ролика и масштабируется под
 * окно (см. CustomVideoPlayer.css); панель прячется, пока видео идёт и мышь
 * не двигается. Клавиши при фокусе: пробел/K — пауза, ←/→ — 5 с, M — звук,
 * F — во весь экран. Двойной клик — во весь экран.
 */
const CustomVideoPlayer: React.FC<CustomVideoPlayerProps> = ({ src, onExpand, onError, autoPlay, className, startTime = 0, isExpandedView }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerRef = useRef<HTMLDivElement>(null);
    const hideTimer = useRef<number | undefined>(undefined);
    const clickTimer = useRef<number | undefined>(undefined);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isWaiting, setIsWaiting] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [speed, setSpeed] = useState(1);
    const { current, duration } = useMediaTime(videoRef);

    // Новая позиция старта (лайтбокс переключил ролик) и автозапуск.
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        if (startTime > 0) v.currentTime = startTime;
        if (autoPlay) v.play().catch(() => { });
    }, [src, autoPlay, startTime]);

    useEffect(() => () => { window.clearTimeout(hideTimer.current); window.clearTimeout(clickTimer.current); }, []);

    const wake = useCallback(() => {
        setShowControls(true);
        window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => {
            if (videoRef.current && !videoRef.current.paused) setShowControls(false);
        }, HIDE_DELAY);
    }, []);

    const togglePlay = useCallback(() => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused || v.ended) v.play().catch(() => { });
        else v.pause();
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
        else playerRef.current?.requestFullscreen?.().catch(() => { });
    }, []);

    // Одиночный клик — пауза, двойной — во весь экран (без паузы-мигания).
    const onSurfaceClick = () => {
        if (clickTimer.current) {
            window.clearTimeout(clickTimer.current);
            clickTimer.current = undefined;
            toggleFullscreen();
            return;
        }
        clickTimer.current = window.setTimeout(() => { clickTimer.current = undefined; togglePlay(); }, 220);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        const v = videoRef.current;
        if (!v) return;
        const key = e.key.toLowerCase();
        if (key === ' ' || key === 'k') togglePlay();
        else if (key === 'arrowright') v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
        else if (key === 'arrowleft') v.currentTime = Math.max(0, v.currentTime - 5);
        else if (key === 'm') v.muted = !v.muted;
        else if (key === 'f') toggleFullscreen();
        else return;
        e.preventDefault();
        e.stopPropagation();
        wake();
    };

    const cycleSpeed = (e: React.MouseEvent) => {
        e.stopPropagation();
        const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
        setSpeed(next);
        if (videoRef.current) videoRef.current.playbackRate = next;
    };

    const controlsVisible = showControls || !isPlaying;
    const classes = [
        'zv-video',
        isExpandedView ? 'zv-video--expanded' : '',
        controlsVisible ? 'zv-video--controls' : 'zv-video--hide-cursor',
        className || '',
    ].filter(Boolean).join(' ');

    return (
        <div
            ref={playerRef}
            className={classes}
            tabIndex={0}
            onMouseMove={wake}
            onMouseEnter={wake}
            onMouseLeave={() => { if (isPlaying) setShowControls(false); }}
            onKeyDown={onKeyDown}
            onClick={(e) => e.stopPropagation()}
        >
            <video
                ref={videoRef}
                src={src}
                className="zv-video__media"
                playsInline
                preload="metadata"
                onClick={onSurfaceClick}
                onPlay={() => { setIsPlaying(true); wake(); }}
                onPause={() => { setIsPlaying(false); setShowControls(true); }}
                onEnded={() => { setIsPlaying(false); setShowControls(true); }}
                onWaiting={() => setIsWaiting(true)}
                onPlaying={() => setIsWaiting(false)}
                onCanPlay={() => setIsWaiting(false)}
                onError={() => onError?.()}
            />

            <div className="zv-video__center">
                {isWaiting && isPlaying ? (
                    <div className="zv-video__spinner" />
                ) : !isPlaying ? (
                    <div className="zv-video__big-play"><PlayIcon size={28} color="#fff" /></div>
                ) : null}
            </div>

            <div className="zv-video__controls" onClick={(e) => e.stopPropagation()}>
                <SeekBar mediaRef={videoRef} />
                <div className="zv-player__row">
                    <button className="zv-player__btn" onClick={togglePlay} title={isPlaying ? 'Пауза' : 'Воспроизвести'} aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}>
                        {isPlaying ? <PauseIcon size={18} color="currentColor" /> : <PlayIcon size={18} color="currentColor" />}
                    </button>
                    <VolumeControl mediaRef={videoRef} />
                    <span className="zv-player__time">{formatTime(current)} / {formatTime(duration)}</span>
                    <span className="zv-player__spacer" />
                    <button className="zv-player__btn zv-player__speed" onClick={cycleSpeed} title="Скорость воспроизведения">
                        {speed}×
                    </button>
                    {onExpand && !isExpandedView && (
                        <button
                            className="zv-player__btn"
                            title="Развернуть"
                            aria-label="Развернуть"
                            onClick={(e) => {
                                e.stopPropagation();
                                const v = videoRef.current;
                                v?.pause();
                                onExpand(v?.currentTime || 0);
                            }}
                        >
                            <ExpandIcon size={17} color="currentColor" />
                        </button>
                    )}
                    <button className="zv-player__btn" onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} title="Во весь экран" aria-label="Во весь экран">
                        <FullscreenIcon size={18} color="currentColor" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CustomVideoPlayer;
