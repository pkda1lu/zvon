import React, { useEffect, useRef, useState } from 'react';
import { VoicePresenceInfo } from '../contexts/VoiceContext';
import './PresenceTile.css';

interface Props {
    presence: VoicePresenceInfo;
    videoStream?: MediaStream;
    volume: number;
    onVolumeChange: (volume: number) => void;
    onControl: (controlId: string, value?: any) => void;
}

/**
 * Visual tile for a mini-app "voice presence" inside a voice channel.
 * Uses the standard p-card classes so it sits naturally next to user cards.
 * Audio playback for the presence happens in VoiceContext (hidden audio elements),
 * not here — keeps this component purely visual and avoids autoplay races.
 */
const PresenceTile: React.FC<Props> = ({ presence, videoStream, volume, onVolumeChange, onControl }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const bgVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (!videoStream || !videoRef.current) return;
        if (videoRef.current.srcObject !== videoStream) videoRef.current.srcObject = videoStream;
        videoRef.current.play().catch(() => {});
    }, [videoStream]);

    const bg = presence.background;
    const videoUrl = !videoStream && bg?.type === 'video' && bg.url ? bg.url : null;
    const cover = !videoStream && !videoUrl && bg?.type === 'image' && bg.url
        ? bg.url
        : (!videoStream && !videoUrl && presence.avatar) || null;
    const solidBg = !videoStream && !videoUrl && bg?.type === 'color' && bg.color ? bg.color : undefined;

    useEffect(() => {
        const el = bgVideoRef.current;
        if (!el || !videoUrl) return;
        console.log('[PresenceTile] loading bg video:', videoUrl);
        if (el.src !== videoUrl) el.src = videoUrl;
        el.muted = true;
        el.loop = true;
        el.playsInline = true;
        el.play().then(() => console.log('[PresenceTile] bg video playing')).catch((e) => console.warn('[PresenceTile] bg video play failed:', e));
        const onErr = (e: any) => console.warn('[PresenceTile] bg video error:', e, el.error);
        el.addEventListener('error', onErr);
        return () => el.removeEventListener('error', onErr);
    }, [videoUrl]);

    return (
        <div className="p-card presence-card" onClick={(e) => e.stopPropagation()}>
            {videoStream && <video ref={videoRef} className="p-camera-video" autoPlay playsInline muted />}
            {videoUrl && (
                <video ref={bgVideoRef} className="p-camera-video presence-bg-video" autoPlay loop muted playsInline />
            )}
            {!videoStream && !videoUrl && cover && (
                <div className="p-bg presence-cover" style={{ backgroundImage: `url('${cover}')` }} />
            )}
            {solidBg && <div className="p-bg" style={{ background: solidBg, opacity: 1, filter: 'none' }} />}

            {!videoStream && !videoUrl && cover && (
                <div className="presence-cover-front" style={{ backgroundImage: `url('${cover}')` }} />
            )}

            <div className="p-info presence-info">
                <div className="p-name-row">
                    <span className="p-name">{presence.displayName}</span>
                    <span className="p-badge presence-badge">МИНИ-АППКА</span>
                </div>
            </div>

            {presence.controls && presence.controls.length > 0 && (
                <div className="presence-controls">
                    {presence.controls.map(ctrl => (
                        <PresenceControl key={ctrl.id} ctrl={ctrl} onControl={onControl} />
                    ))}
                </div>
            )}

            <div className="presence-volume" title={`Громкость: ${Math.round(volume * 100)}%`}>
                <span className="presence-volume-icon">{volume === 0 ? '🔇' : volume < 0.5 ? '🔈' : volume < 1 ? '🔉' : '🔊'}</span>
                <input
                    type="range"
                    className="presence-volume-slider"
                    min={0}
                    max={200}
                    value={Math.round(volume * 100)}
                    onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
                    onClick={(e) => e.stopPropagation()}
                />
            </div>
        </div>
    );
};

const PresenceControl: React.FC<{
    ctrl: VoicePresenceInfo['controls'][number];
    onControl: Props['onControl'];
}> = ({ ctrl, onControl }) => {
    const [local, setLocal] = useState<number | null>(null);
    if (ctrl.kind === 'slider') {
        return (
            <input
                type="range"
                className="presence-slider"
                min={ctrl.min ?? 0}
                max={ctrl.max ?? 100}
                value={local ?? ctrl.value ?? 0}
                title={ctrl.tooltip || ctrl.label}
                onChange={(e) => setLocal(Number(e.target.value))}
                onMouseUp={(e) => { onControl(ctrl.id, Number((e.target as HTMLInputElement).value)); setLocal(null); }}
                onTouchEnd={(e) => { onControl(ctrl.id, Number((e.target as HTMLInputElement).value)); setLocal(null); }}
            />
        );
    }
    const styleClass = ctrl.style ? ` presence-btn-${ctrl.style}` : '';
    return (
        <button
            className={`presence-btn${styleClass}`}
            title={ctrl.tooltip || ctrl.label}
            onClick={(e) => { e.stopPropagation(); onControl(ctrl.id); }}
        >
            {ctrl.label || ctrl.id}
        </button>
    );
};

export default PresenceTile;
