import React from 'react';
import { PlusIcon } from './Icons';

interface InterfacePreviewProps {
    settings: {
        theme: 'dark' | 'amoled';
        customColors: {
            primary: string;
            secondary: string;
            accent: string;
        };
        customBackground?: string;
        backgroundDim?: number;
        backgroundBlur?: number;
    };
    scale?: number;
}

const InterfacePreview: React.FC<InterfacePreviewProps> = ({ settings, scale = 1 }) => {
    const isAmoled = settings.theme === 'amoled';
    const glassStyle = {
        background: isAmoled ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.04)',
        borderColor: isAmoled ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(16px)'
    };

    return (
        <div className="interface-preview-scaling-wrapper" style={{ 
            transform: `scale(${scale})`,
            transformOrigin: 'top left'
        }}>
            <div className="large-interface-preview liquid-glass-preview" style={{ 
                '--primary-neon': settings.customColors.primary,
                '--secondary-neon': settings.customColors.secondary,
                '--accent-pink': settings.customColors.accent,
                background: isAmoled ? '#000' : '#0a0a0f',
            } as any}>
                {/*
                    Затемнение делается ровно так же, как в приложении (см. App.tsx):
                    картинка в полную непрозрачность плюс чёрная плёнка поверх.
                    Раньше предпросмотр вместо этого гасил непрозрачность самой
                    картинки — она смешивалась с подложкой предпросмотра, а не
                    затемнялась, и результат отличался от настоящего.
                */}
                {settings.customBackground && (
                    <>
                        <div className="preview-full-bg" style={{
                            backgroundImage: `url(${settings.customBackground})`,
                            filter: settings.backgroundBlur ? `blur(${settings.backgroundBlur}px)` : undefined
                        }} />
                        <div className="preview-full-bg-dim" style={{
                            backgroundColor: `rgba(0, 0, 0, ${(settings.backgroundDim || 0) / 100})`
                        }} />
                    </>
                )}
                
                <div className="preview-layout-grid">
                    {/* 1. Servers Sidebar */}
                    <div className="preview-sidebar-servers" style={{...glassStyle, backdropFilter: 'blur(12px)'}}>
                        <div className="preview-server-item active" style={{background: 'var(--primary-neon)'}} />
                        <div className="preview-sidebar-sep" />
                        <div className="preview-server-item" />
                        <div className="preview-server-item" />
                        <div className="preview-server-item plus-item">
                            <PlusIcon size={12} />
                        </div>
                    </div>

                    {/* 2. Channels Sidebar */}
                    <div className="preview-sidebar-channels" style={glassStyle}>
                        <div className="preview-guild-name-box" />
                        <div className="preview-scroll-area">
                            <div className="preview-cat-label" />
                            <div className="preview-chan-row active">
                                <div className="preview-chan-icon" />
                                <div className="preview-chan-line" />
                            </div>
                            <div className="preview-chan-row">
                                <div className="preview-chan-icon" />
                                <div className="preview-chan-line" />
                            </div>
                            <div className="preview-cat-label" />
                            <div className="preview-chan-row">
                                <div className="preview-chan-icon" />
                                <div className="preview-chan-line" />
                            </div>
                        </div>
                        <div className="preview-user-panel" style={{...glassStyle, border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)'}}>
                            <div className="preview-user-avatar" />
                            <div className="preview-user-info-lines">
                                <div className="preview-user-name" />
                                <div className="preview-user-status" />
                            </div>
                        </div>
                    </div>

                    {/* 3. Main Chat View */}
                    <div className="preview-chat-main">
                        <div className="preview-chat-topbar" style={{...glassStyle, backdropFilter: 'blur(10px)'}}>
                            <div className="preview-topbar-title">
                                <div className="preview-hash" />
                                <div className="preview-title-text" />
                            </div>
                            <div className="preview-topbar-actions">
                                <div className="preview-act-icon" />
                                <div className="preview-act-icon" />
                                <div className="preview-act-icon" />
                            </div>
                        </div>
                        <div className="preview-messages-list">
                            <div className="preview-msg-item">
                                <div className="preview-msg-avatar" style={{background: 'var(--primary-neon)'}} />
                                <div className="preview-msg-content">
                                    <div className="preview-msg-author" style={{color: 'var(--primary-neon)'}} />
                                    <div className="preview-msg-text" />
                                    <div className="preview-msg-text short" />
                                </div>
                            </div>
                            <div className="preview-msg-item">
                                <div className="preview-msg-avatar" style={{background: 'var(--secondary-neon)'}} />
                                <div className="preview-msg-content">
                                    <div className="preview-msg-author" style={{color: 'var(--secondary-neon)'}} />
                                    <div className="preview-msg-text" />
                                </div>
                            </div>
                            <div className="preview-msg-item system">
                                <div className="preview-system-line" />
                            </div>
                        </div>
                        <div className="preview-chat-input-area">
                            <div className="preview-chat-input" style={glassStyle}>
                                <div className="preview-input-plus" />
                                <div className="preview-input-placeholder" />
                                <div className="preview-input-icons" />
                            </div>
                        </div>
                    </div>

                    {/* 4. Members Sidebar */}
                    <div className="preview-sidebar-members" style={glassStyle}>
                        <div className="preview-member-cat" />
                        <div className="preview-member-row">
                            <div className="preview-mem-avatar" style={{background: 'var(--primary-neon)'}} />
                            <div className="preview-mem-name" />
                        </div>
                        <div className="preview-member-row">
                            <div className="preview-mem-avatar" style={{background: 'var(--secondary-neon)'}} />
                            <div className="preview-mem-name" />
                        </div>
                        <div className="preview-member-cat" />
                        <div className="preview-member-row">
                            <div className="preview-mem-avatar" />
                            <div className="preview-mem-name" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InterfacePreview;
