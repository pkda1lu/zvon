import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VolumeHighIcon, VolumeLowIcon, SpeakerMutedIcon } from './Icons';

/*
 * Общие части медиаплеера Zvon: полоса перемотки с буфером, время, громкость.
 * Используются видео- и аудиоплеером (CustomVideoPlayer / CustomAudioPlayer).
 */

export const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ss = s < 10 ? `0${s}` : String(s);
    if (h > 0) return `${h}:${m < 10 ? `0${m}` : m}:${ss}`;
    return `${m}:${ss}`;
};

/** Извлечь предварительную длительность из имени файла (-dur14.mp4 / _dur14.m4a). */
export const parseDurationFromFilename = (filename?: string): number => {
    if (!filename) return 0;
    const match = filename.match(/[-_]dur(\d+(?:\.\d+)?)/i);
    return match ? parseFloat(match[1]) : 0;
};

/** Длительность, у потоковых файлов часто сначала Infinity. */
export const finiteDuration = (m: HTMLMediaElement, fallback = 0) => {
    if (isFinite(m.duration) && m.duration > 0) return m.duration;
    if (fallback && isFinite(fallback) && fallback > 0) return fallback;
    return 0;
};

/**
 * Время воспроизведения для подписи. Обновляется раз в секунду воспроизведения,
 * а не на каждый timeupdate, — подпись показывает целые секунды.
 */
export const useMediaTime = (mediaRef: React.RefObject<HTMLMediaElement | null>, initialDuration = 0) => {
    const [current, setCurrent] = useState(0);
    const [duration, setDuration] = useState(initialDuration);

    useEffect(() => {
        if (initialDuration > 0) {
            setDuration(prev => (prev > 0 ? prev : initialDuration));
        }
    }, [initialDuration]);

    useEffect(() => {
        const m = mediaRef.current;
        if (!m) return;
        const onTime = () => setCurrent(prev => (Math.floor(prev) === Math.floor(m.currentTime) ? prev : m.currentTime));
        let isDisposed = false;
        let hasResolved = false;

        const updateDur = (newDur: number) => {
            if (isDisposed) return;
            if (isFinite(newDur) && newDur > 0) {
                hasResolved = true;
                setDuration(newDur);
            }
        };

        const onDur = () => {
            if (isFinite(m.duration) && m.duration > 0) {
                updateDur(m.duration);
            } else if ((m.duration === Infinity || isNaN(m.duration) || m.duration === 0) && !hasResolved) {
                const onSeeked = () => {
                    m.removeEventListener('seeked', onSeeked);
                    if (isDisposed) return;
                    if (isFinite(m.duration) && m.duration > 0) {
                        updateDur(m.duration);
                    }
                    m.currentTime = 0;
                };
                m.addEventListener('seeked', onSeeked, { once: true });
                try {
                    m.currentTime = 1e101;
                } catch {}
            }
        };

        m.addEventListener('timeupdate', onTime);
        m.addEventListener('seeked', onTime);
        m.addEventListener('durationchange', onDur);
        m.addEventListener('loadedmetadata', onDur);
        m.addEventListener('loadeddata', onDur);
        onDur();

        return () => {
            m.removeEventListener('timeupdate', onTime);
            m.removeEventListener('seeked', onTime);
            m.removeEventListener('durationchange', onDur);
            m.removeEventListener('loadedmetadata', onDur);
            m.removeEventListener('loadeddata', onDur);
            isDisposed = true;
        };
    }, [mediaRef]);

    return { current, duration: duration || initialDuration };
};

/**
 * Полоса перемотки. Проигранная и буферизованная части — CSS-переменные на
 * корне (--zv-played, --zv-buffered), их выставляем прямо в DOM на событиях
 * медиа, без перерисовки React. Перетаскивание — указателем (мышь и палец),
 * стрелки на клавиатуре — по 5 секунд.
 */
export const SeekBar: React.FC<{ mediaRef: React.RefObject<HTMLMediaElement | null>; duration?: number }> = ({ mediaRef, duration: fallbackDuration }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const [dragging, setDragging] = useState(false);

    const paint = useCallback((playedFraction?: number) => {
        const m = mediaRef.current;
        const root = rootRef.current;
        if (!m || !root) return;
        const d = finiteDuration(m, fallbackDuration);
        const played = playedFraction ?? (d ? m.currentTime / d : 0);
        let buffered = 0;
        try {
            if (d && m.buffered.length) buffered = m.buffered.end(m.buffered.length - 1) / d;
        } catch { /* буфер ещё не готов */ }
        root.style.setProperty('--zv-played', `${Math.min(100, Math.max(0, played * 100))}%`);
        root.style.setProperty('--zv-buffered', `${Math.min(100, Math.max(0, buffered * 100))}%`);
        root.setAttribute('aria-valuenow', String(Math.round(m.currentTime)));
        root.setAttribute('aria-valuemax', String(Math.round(d)));
    }, [mediaRef, fallbackDuration]);

    useEffect(() => {
        const m = mediaRef.current;
        if (!m) return;
        const onUpdate = () => { if (!draggingRef.current) paint(); };
        const events = ['timeupdate', 'progress', 'durationchange', 'loadedmetadata', 'seeked'];
        events.forEach(e => m.addEventListener(e, onUpdate));
        paint();
        return () => events.forEach(e => m.removeEventListener(e, onUpdate));
    }, [mediaRef, paint]);

    const fractionAt = (clientX: number) => {
        const rect = rootRef.current!.getBoundingClientRect();
        return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    };

    const seekTo = (fraction: number) => {
        const m = mediaRef.current;
        if (!m) return;
        const d = finiteDuration(m, fallbackDuration);
        if (d) m.currentTime = fraction * d;
    };

    const onPointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        draggingRef.current = true;
        setDragging(true);
        paint(fractionAt(e.clientX));
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!draggingRef.current) return;
        paint(fractionAt(e.clientX));
    };
    const onPointerUp = (e: React.PointerEvent) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        setDragging(false);
        seekTo(fractionAt(e.clientX));
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        const m = mediaRef.current;
        if (!m) return;
        const d = finiteDuration(m, fallbackDuration);
        if (e.key === 'ArrowRight') { m.currentTime = Math.min(d, m.currentTime + 5); e.preventDefault(); e.stopPropagation(); }
        if (e.key === 'ArrowLeft') { m.currentTime = Math.max(0, m.currentTime - 5); e.preventDefault(); e.stopPropagation(); }
    };

    return (
        <div
            ref={rootRef}
            className={`zv-player__seek ${dragging ? 'is-dragging' : ''}`}
            role="slider"
            tabIndex={0}
            aria-label="Перемотка"
            aria-valuemin={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onKeyDown}
        >
            <div className="zv-player__track">
                <div className="zv-player__buffered" />
                <div className="zv-player__played" />
            </div>
            <div className="zv-player__thumb" />
        </div>
    );
};

/** Громкость: кнопка звука и ползунок, раскрывающийся при наведении. */
export const VolumeControl: React.FC<{ mediaRef: React.RefObject<HTMLMediaElement | null>; iconSize?: number }> = ({ mediaRef, iconSize = 18 }) => {
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);

    useEffect(() => {
        const m = mediaRef.current;
        if (!m) return;
        const sync = () => { setVolume(m.volume); setMuted(m.muted || m.volume === 0); };
        m.addEventListener('volumechange', sync);
        sync();
        return () => m.removeEventListener('volumechange', sync);
    }, [mediaRef]);

    const toggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        const m = mediaRef.current;
        if (!m) return;
        if (m.muted || m.volume === 0) {
            m.muted = false;
            if (m.volume === 0) m.volume = 0.5;
        } else {
            m.muted = true;
        }
    };

    const level = muted ? 0 : volume;
    return (
        <div className="zv-player__volume" onClick={(e) => e.stopPropagation()}>
            <button className="zv-player__btn" onClick={toggle} title={muted ? 'Включить звук' : 'Выключить звук'} aria-label="Звук">
                {level === 0 ? <SpeakerMutedIcon size={iconSize} color="currentColor" /> : level > 0.5 ? <VolumeHighIcon size={iconSize} color="currentColor" /> : <VolumeLowIcon size={iconSize} color="currentColor" />}
            </button>
            <input
                type="range"
                className="zv-player__volume-range"
                min={0}
                max={1}
                step={0.05}
                value={level}
                aria-label="Громкость"
                onChange={(e) => {
                    const m = mediaRef.current;
                    if (!m) return;
                    const v = Number(e.target.value);
                    m.volume = v;
                    m.muted = v === 0;
                }}
            />
        </div>
    );
};
