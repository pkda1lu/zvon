import React, { useRef, useState } from 'react';
import './CustomAudioPlayer.css';
import { PlayIcon, PauseIcon } from './Icons';
import { SeekBar, VolumeControl, formatTime, useMediaTime } from './MediaControls';

interface CustomAudioPlayerProps {
    src: string;
    filename?: string;
    className?: string;
    /** Файл не воспроизводится — родитель покажет карточку файла. */
    onError?: () => void;
}

/**
 * Аудиоплеер Zvon: стеклянная карточка с кнопкой воспроизведения, именем
 * файла, перемоткой с буфером и громкостью. Клавиши при фокусе: пробел —
 * пауза, ←/→ — 5 с, M — звук.
 */
const CustomAudioPlayer: React.FC<CustomAudioPlayerProps> = ({ src, filename, className, onError }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const { current, duration } = useMediaTime(audioRef);

    const toggle = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        const a = audioRef.current;
        if (!a) return;
        if (a.paused || a.ended) a.play().catch(() => { });
        else a.pause();
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        const a = audioRef.current;
        if (!a) return;
        const key = e.key.toLowerCase();
        if (key === ' ' || key === 'k') toggle();
        else if (key === 'arrowright') a.currentTime = Math.min(a.duration || 0, a.currentTime + 5);
        else if (key === 'arrowleft') a.currentTime = Math.max(0, a.currentTime - 5);
        else if (key === 'm') a.muted = !a.muted;
        else return;
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div className={`zv-audio ${className || ''}`} tabIndex={0} onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()}>
            <audio
                ref={audioRef}
                src={src}
                preload="metadata"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onError={() => onError?.()}
            />
            <button className="zv-audio__play" onClick={toggle} title={isPlaying ? 'Пауза' : 'Воспроизвести'} aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}>
                {isPlaying
                    ? <PauseIcon size={20} color="#fff" />
                    : <PlayIcon size={20} color="#fff" className="zv-audio__play-icon--play" />}
            </button>
            <div className="zv-audio__body">
                <div className="zv-audio__name" title={filename}>{filename || 'Аудио'}</div>
                <div className="zv-player__row">
                    <span className="zv-player__time">{formatTime(current)}</span>
                    <SeekBar mediaRef={audioRef} />
                    <span className="zv-player__time zv-player__time--end">{formatTime(duration)}</span>
                    <VolumeControl mediaRef={audioRef} iconSize={16} />
                </div>
            </div>
        </div>
    );
};

export default CustomAudioPlayer;
