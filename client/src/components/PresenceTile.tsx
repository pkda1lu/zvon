import React, { useEffect, useRef, useState } from 'react';
import { VoicePresenceInfo } from '../contexts/VoiceContext';
import './PresenceTile.css';

interface Props {
    presence: VoicePresenceInfo;
    videoStream?: MediaStream;
    onControl: (controlId: string, value?: any) => void;
}

/**
 * Visual tile for a mini-app "voice presence" inside a voice channel.
 * Uses the standard p-card classes so it sits naturally next to user cards.
 * Audio playback for the presence happens in VoiceContext (hidden audio elements),
 * not here — keeps this component purely visual and avoids autoplay races.
 */
const PresenceTile: React.FC<Props> = ({ presence, videoStream, onControl }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (!videoStream || !videoRef.current) return;
        if (videoRef.current.srcObject !== videoStream) videoRef.current.srcObject = videoStream;
        videoRef.current.play().catch(() => {});
    }, [videoStream]);

    const bg = presence.background;
    const cover = !videoStream && bg?.type === 'image' && bg.url
        ? bg.url
        : (!videoStream && presence.avatar) || null;

    const solidBg = !videoStream && bg?.type === 'color' && bg.color ? bg.color : undefined;

    return (
        <div className="p-card presence-card" onClick={(e) => e.stopPropagation()}>
            {videoStream && <video ref={videoRef} className="p-camera-video" autoPlay playsInline muted />}
            {!videoStream && cover && (
                <div className="p-bg presence-cover" style={{ backgroundImage: `url('${cover}')` }} />
            )}
            {solidBg && <div className="p-bg" style={{ background: solidBg, opacity: 1, filter: 'none' }} />}

            {!videoStream && cover && (
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
