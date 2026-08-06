import React from 'react';
import { MiniApp } from '../types';
import MiniAppWindow from './MiniAppWindow';

interface MiniAppContainerProps {
    openApps: MiniApp[];
    minimizedIds: Set<string>;
    onClose: (appId: string) => void;
    onMinimize: (appId: string) => void;
}

const MiniAppContainer: React.FC<MiniAppContainerProps> = ({ openApps, minimizedIds, onClose, onMinimize }) => {
    const hasActiveApp = openApps.some(app => !minimizedIds.has(app._id));
    return (
        <div className="miniapp-container" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: hasActiveApp ? 15000 : 9000 }}>
            {openApps.map(app => (
                <div key={app._id} style={{ pointerEvents: minimizedIds.has(app._id) ? 'none' : 'auto' }}>
                    <MiniAppWindow
                        app={app}
                        minimized={minimizedIds.has(app._id)}
                        onClose={onClose}
                        onMinimize={onMinimize}
                    />
                </div>
            ))}
        </div>
    );
};

export default MiniAppContainer;
