import React, { useRef, useState, useEffect } from 'react';
import './RoundVideoPlayer.css';
import { PlayIcon, PauseIcon } from './Icons';
import { Volume2, VolumeX } from 'lucide-react';
import { formatTime } from './MediaControls';

interface RoundVideoPlayerProps {
    src: string;
    filename?: string;
    onError?: () => void;
    onExpand?: (currentTime?: number) => void;
}

const RoundVideoPlayer: React.FC<RoundVideoPlayerProps> = ({
    src,
    onError,
    onExpand
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;

        const onTime = () => setCurrentTime(v.currentTime);
        const onLoaded = () => {
            if (isFinite(v.duration)) setDuration(v.duration);
        };
        const onEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);

        v.addEventListener('timeupdate', onTime);
        v.addEventListener('loadedmetadata', onLoaded);
        v.addEventListener('durationchange', onLoaded);
        v.addEventListener('ended', onEnded);
        v.addEventListener('play', onPlay);
        v.addEventListener('pause', onPause);

        return () => {
            v.removeEventListener('timeupdate', onTime);
            v.removeEventListener('loadedmetadata', onLoaded);
            v.removeEventListener('durationchange', onLoaded);
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
            className="round-video-wrapper"
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
