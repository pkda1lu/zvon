import React, { useRef, useState, useEffect } from 'react';
import './RoundVideoPlayer.css';
import { PlayIcon, PauseIcon } from './Icons';
import { Volume2, VolumeX } from 'lucide-react';
import { formatTime, parseDurationFromFilename } from './MediaControls';

interface RoundVideoPlayerProps {
    src: string;
    filename?: string;
    initialDuration?: number;
    onError?: () => void;
    onExpand?: (currentTime?: number) => void;
    /** Крупный кружок для просмотрщика (MediaLightbox). */
    large?: boolean;
    autoPlay?: boolean;
    startTime?: number;
}

const RoundVideoPlayer: React.FC<RoundVideoPlayerProps> = ({
    src,
    filename,
    initialDuration = 0,
    onError,
    onExpand,
    large = false,
    autoPlay = false,
    startTime = 0
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const parsedDuration = initialDuration > 0 ? initialDuration : parseDurationFromFilename(filename);
    const [duration, setDuration] = useState<number>(parsedDuration);
    const [isMuted, setIsMuted] = useState(false);

    useEffect(() => {
        if (initialDuration > 0) {
            setDuration(prev => (prev > 0 ? prev : initialDuration));
        }
    }, [initialDuration]);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;

        let isDisposed = false;
        let hasResolved = false;

        const updateDur = (newDur: number) => {
            if (isDisposed) return;
            if (isFinite(newDur) && newDur > 0) {
                hasResolved = true;
                setDuration(newDur);
            }
        };

        const onTime = () => setCurrentTime(v.currentTime);
        const onDur = () => {
            if (isFinite(v.duration) && v.duration > 0) {
                updateDur(v.duration);
            } else if ((v.duration === Infinity || isNaN(v.duration) || v.duration === 0) && !hasResolved) {
                // Chromium workaround для MediaRecorder: прыжок в конец заставляет
                // демуксер рассчитать реальную длину видео по последнему ключевому кадру.
                const onSeeked = () => {
                    v.removeEventListener('seeked', onSeeked);
                    if (isDisposed) return;
                    if (isFinite(v.duration) && v.duration > 0) {
                        updateDur(v.duration);
                    }
                    v.currentTime = startTime;
                };
                v.addEventListener('seeked', onSeeked, { once: true });
                try {
                    v.currentTime = 1e101;
                } catch {}
            }
        };
        const onEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);

        v.addEventListener('timeupdate', onTime);
        v.addEventListener('loadedmetadata', onDur);
        v.addEventListener('loadeddata', onDur);
        v.addEventListener('durationchange', onDur);
        v.addEventListener('ended', onEnded);
        v.addEventListener('play', onPlay);
        v.addEventListener('pause', onPause);

        if (v.readyState >= 1) {
            onDur();
        }

        if (startTime > 0) v.currentTime = startTime;
        if (autoPlay) v.play().catch(() => {});

        return () => {
            isDisposed = true;
            v.removeEventListener('timeupdate', onTime);
            v.removeEventListener('loadedmetadata', onDur);
            v.removeEventListener('loadeddata', onDur);
            v.removeEventListener('durationchange', onDur);
            v.removeEventListener('ended', onEnded);
            v.removeEventListener('play', onPlay);
            v.removeEventListener('pause', onPause);
        };
    }, []);

    const togglePlay = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        const v = videoRef.current;
        if (!v) return;
        if (v.paused || v.ended) {
            v.play().catch(() => {});
        } else {
            v.pause();
        }
    };

    const toggleMute = (e: React.MouseEvent) => {
        e.stopPropagation();
        const v = videoRef.current;
        if (!v) return;
        v.muted = !v.muted;
        setIsMuted(v.muted);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        const v = videoRef.current;
        if (!v) return;
        if (e.key === ' ' || e.key.toLowerCase() === 'k') {
            e.preventDefault();
            togglePlay();
        } else if (e.key.toLowerCase() === 'm') {
            e.preventDefault();
            v.muted = !v.muted;
            setIsMuted(v.muted);
        }
    };

    // Circular SVG radius and circumference
    const radius = 47;
    const circumference = 2 * Math.PI * radius;
    const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
    const strokeDashoffset = circumference * (1 - progress);

    return (
        <div
            className={`round-video-wrapper${large ? ' round-video-wrapper--large' : ''}`}
            tabIndex={0}
            onKeyDown={onKeyDown}
            role="region"
            aria-label="Видеосообщение"
        >
            <div
                className="round-video-container"
                onClick={togglePlay}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (onExpand && videoRef.current) {
                        onExpand(videoRef.current.currentTime);
                    }
                }}
            >
                <video
                    ref={videoRef}
                    src={src}
                    playsInline
                    preload="metadata"
                    className="round-video-element"
                    onError={() => onError?.()}
                />

                {/* Circular progress SVG */}
                <svg className="round-video-progress-svg" viewBox="0 0 100 100">
                    <circle
                        className="round-video-progress-bg"
                        cx="50"
                        cy="50"
                        r={radius}
                    />
                    <circle
                        className="round-video-progress-bar"
                        cx="50"
                        cy="50"
                        r={radius}
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                    />
                </svg>

                {/* Center Play/Pause button */}
                <button
                    type="button"
                    className={`round-video-center-btn ${isPlaying ? 'is-hidden' : ''}`}
                    onClick={togglePlay}
                    title={isPlaying ? 'Пауза' : 'Воспроизвести'}
                    aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
                >
                    {isPlaying ? <PauseIcon size={26} color="#fff" /> : <PlayIcon size={26} color="#fff" />}
                </button>

                {/* Mute button */}
                <button
                    type="button"
                    className="round-video-mute-btn"
                    onClick={toggleMute}
                    title={isMuted ? 'Включить звук' : 'Выключить звук'}
                    aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
                >
                    {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>

                {/* Time badge */}
                <div className="round-video-time-badge">
                    {formatTime(currentTime)} / {formatTime(duration)}
                </div>
            </div>
        </div>
    );
};

export default RoundVideoPlayer;
