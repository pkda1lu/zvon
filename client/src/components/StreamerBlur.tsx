import React, { useState } from 'react';
import { useWindowSettings } from '../contexts/WindowSettingsContext';

interface StreamerBlurProps {
    children: React.ReactNode;
    active?: boolean;
}

/**
 * StreamerBlur: Censorship component for unique info.
 * Applies a blur effect when Streamer Mode is ON and censorship is enabled.
 * Clicking reveals the content.
 */
const StreamerBlur: React.FC<StreamerBlurProps> = ({ children, active = true }) => {
    const { streamerModeEnabled, censorInfo } = useWindowSettings();
    const [revealed, setRevealed] = useState(false);

    const shouldBlur = active && streamerModeEnabled && censorInfo && !revealed;

    if (!shouldBlur) return <>{children}</>;

    return (
        <span 
            className="streamer-blur-content" 
            onClick={(e) => {
                e.stopPropagation();
                setRevealed(true);
            }}
            style={{
                filter: 'blur(8px)',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'filter 0.3s ease',
                display: 'inline-block',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '4px',
                padding: '0 4px'
            }}
            title="Нажмите, чтобы показать"
        >
            {children}
        </span>
    );
};

export default StreamerBlur;
