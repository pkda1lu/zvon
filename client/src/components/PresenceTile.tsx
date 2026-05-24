import React, { useEffect, useRef } from 'react';
import { VoicePresenceInfo } from '../contexts/VoiceContext';
import './PresenceTile.css';

interface Props {
    presence: VoicePresenceInfo;
    audioStream?: MediaStream;
    videoStream?: MediaStream;
    isDeafened?: boolean;
    onControl: (controlId: string, value?: any) => void;
}

/** Visual tile for a mini-app "voice presence" inside a voice channel. */
const PresenceTile: React.FC<Props> = ({ presence, audioStream, videoStream, isDeafened, onControl }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (!audioStream || !audioRef.current) return;
        audioRef.current.srcObject = audioStream;
        audioRef.current.play().catch(() => {});
    }, [audioStream]);

    useEffect(() => {
        if (!videoStream || !videoRef.current) return;
        videoRef.current.srcObject = videoStream;
        videoRef.current.play().catch(() => {});
    }, [videoStream]);

    useEffect(() => {
        if (audioRef.current) audioRef.current.muted = !!isDeafened;
    }, [isDeafened]);

    const bgStyle: React.CSSProperties = {};
    if (videoStream) {
        // video element overlay handles it
    } else if (presence.background?.type === 'image' && presence.background.url) {
        bgStyle.backgroundImage = `url('${presence.background.url}')`;
    } else if (presence.background?.type === 'color' && presence.background.color) {
        bgStyle.background = presence.background.color;
    } else if (presence.avatar) {
        bgStyle.backgroundImage = `url('${presence.avatar}')`;
    }

    return (
        <div className="presence-tile" style={bgStyle}>
            {videoStream && (
                <video ref={videoRef} className="presence-video" autoPlay playsInline muted />
            )}
            <div className="presence-tile-overlay">
                <div className="presence-tile-name">
                    <span className="presence-tile-badge">МИНИ-АППКА</span>
                    {presence.displayName}
                </div>
                {presence.controls && presence.controls.length > 0 && (
                    <div className="presence-tile-controls">
                        {presence.controls.map(ctrl => (
                            <PresenceControl key={ctrl.id} ctrl={ctrl} onControl={onControl} />
                        ))}
                    </div>
                )}
            </div>
            <audio ref={audioRef} autoPlay playsInline />
        </div>
    );
};

const PresenceControl: React.FC<{ ctrl: VoicePresenceInfo['controls'][number]; onControl: Props['onControl'] }> = ({ ctrl, onControl }) => {
    if (ctrl.kind === 'slider') {
        const [local, setLocal] = React.useState<number | null>(null);
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
            onClick={() => onControl(ctrl.id)}
        >
            {ctrl.label || ctrl.id}
        </button>
    );
};

export default PresenceTile;
