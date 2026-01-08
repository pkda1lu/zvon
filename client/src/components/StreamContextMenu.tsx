import React, { useState, useEffect } from 'react';
import { useVoice } from '../contexts/VoiceContext';
import { User } from '../types';
import {
    StopScreenShareIcon,
    ScreenShareIcon,
    ChevronRightIcon,
    CheckIcon,
    VolumeHighIcon
} from './Icons';
import './StreamContextMenu.css';

interface StreamContextMenuProps {
    x: number;
    y: number;
    user: User;
    isMe: boolean;
    onClose: () => void;
}

const StreamContextMenu: React.FC<StreamContextMenuProps> = ({ x, y, user, isMe, onClose }) => {
    const {
        toggleScreenShare,
        changeScreenSource,
        updateScreenQuality,
        isSharingScreenAudio,
        toggleScreenAudio,
        streamVolumes,
        setStreamVolume
    } = useVoice();

    const [showQualitySubmenu, setShowQualitySubmenu] = useState(false);

    // Current volume for viewers
    const currentVolume = streamVolumes.has(user._id) ? streamVolumes.get(user._id)! : 1;

    useEffect(() => {
        const handleClick = () => onClose();
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [onClose]);

    const handleAction = (e: React.MouseEvent, action: () => void) => {
        e.stopPropagation();
        action();
        if (!showQualitySubmenu) onClose();
    };

    const qualities = [
        { label: '480p', resolution: '480p', fps: 30 },
        { label: '720p', resolution: '720p', fps: 30 },
        { label: '1080p', resolution: '1080p', fps: 60 },
        { label: '1440p', resolution: '1440p', fps: 60 },
        { label: '4K', resolution: '4k', fps: 60 }
    ];

    return (
        <div
            className="stream-context-menu"
            style={{ top: y, left: x }}
            onClick={(e) => e.stopPropagation()}
        >
            {isMe ? (
                <>
                    <div className="menu-item danger" onClick={(e) => handleAction(e, toggleScreenShare)}>
                        <div className="menu-item-label">Прекратить стрим</div>
                        <StopScreenShareIcon size={18} color="#f04747" />
                    </div>
                    <div className="menu-item" onClick={(e) => handleAction(e, changeScreenSource)}>
                        <div className="menu-item-label">Изменить источник</div>
                        <ScreenShareIcon size={18} />
                    </div>
                    <div
                        className="menu-item has-submenu"
                        onMouseEnter={() => setShowQualitySubmenu(true)}
                        onMouseLeave={() => setShowQualitySubmenu(false)}
                    >
                        <div className="menu-item-label">Качество передачи</div>
                        <ChevronRightIcon size={18} />

                        {showQualitySubmenu && (
                            <div className="submenu">
                                {qualities.map((q) => (
                                    <div
                                        key={q.resolution}
                                        className="menu-item"
                                        onClick={(e) => handleAction(e, () => updateScreenQuality({ resolution: q.resolution, frameRate: q.fps }))}
                                    >
                                        <div className="menu-item-label">{q.label} {q.fps}fps</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="menu-item" onClick={(e) => handleAction(e, toggleScreenAudio)}>
                        <div className="menu-item-label">Поделиться звуком стрима</div>
                        <div className={`menu-checkbox ${isSharingScreenAudio ? 'checked' : ''}`}>
                            {isSharingScreenAudio && <CheckIcon size={14} color="white" />}
                        </div>
                    </div>
                </>
            ) : (
                <div className="menu-section">
                    <div className="menu-label">Громкость эфира</div>
                    <div className="volume-control">
                        <VolumeHighIcon size={18} />
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={currentVolume}
                            onChange={(e) => setStreamVolume(user._id, parseFloat(e.target.value))}
                            onClick={(e) => e.stopPropagation()}
                        />
                        <span className="volume-percent">{Math.round(currentVolume * 100)}%</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StreamContextMenu;
