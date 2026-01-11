import React from 'react';
import './PreviewStyles.css';

const DesignPreview: React.FC = () => {
    return (
        <div className="preview-container">
            <div className="preview-background"></div>

            <div className="preview-layout">
                {/* Sidebar */}
                <aside className="preview-sidebar">
                    <div className="sidebar-icon active">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                    </div>
                    <div className="sidebar-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                    </div>
                    <div className="sidebar-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    </div>
                    <div className="sidebar-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                    </div>
                    <div style={{ marginTop: 'auto' }}>
                        <div className="sidebar-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                        </div>
                    </div>
                </aside>

                <main className="preview-main">
                    {/* Topbar */}
                    <header className="preview-topbar">
                        <div className="logo-area">
                            <svg className="logo-bell" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                            <span>Zvon</span>
                        </div>

                        <div className="search-container">
                            <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                            <input type="text" className="search-input" placeholder="Search servers, friends..." />
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="neon-btn">Create Server</button>
                            <div className="avatar" style={{ border: '2px solid var(--primary-neon)' }}></div>
                        </div>
                    </header>

                    {/* Main Content Grid */}
                    <div className="content-grid">
                        {/* Server List / Channels */}
                        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Channels</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'var(--primary-neon)' }}># general</div>
                                <div style={{ padding: '8px 12px', borderRadius: '8px', color: 'var(--text-muted)' }}># development</div>
                                <div style={{ padding: '8px 12px', borderRadius: '8px', color: 'var(--text-muted)' }}># design-tokens</div>
                                <div style={{ padding: '8px 12px', borderRadius: '8px', color: 'var(--text-muted)' }}># gaming-news</div>
                            </div>
                        </div>

                        {/* Chat Area */}
                        <div className="glass-panel chat-area">
                            <div className="message-card">
                                <div className="avatar"></div>
                                <div>
                                    <div className="message-header">
                                        <span className="username">Alex Vector</span>
                                        <span className="timestamp">Today at 2:14 PM</span>
                                    </div>
                                    <div className="message-text">
                                        This new glassmorphic UI feels amazing! The blur effect and neon accents are exactly what we needed for the Zvon experience.
                                    </div>
                                </div>
                            </div>

                            <div className="message-card">
                                <div className="avatar" style={{ background: 'linear-gradient(45deg, #00d2ff, #3a7bd5)' }}></div>
                                <div>
                                    <div className="message-header">
                                        <span className="username" style={{ color: '#00d2ff' }}>CyberNaut</span>
                                        <span className="timestamp">Today at 2:16 PM</span>
                                    </div>
                                    <div className="message-text">
                                        Agreed. The performance seems rock solid with the new rendering engine. Check out this motion blur on the spheres! 🚀
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: 'auto', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                                <input type="text" style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', outline: 'none' }} placeholder="Message #general" />
                            </div>
                        </div>

                        {/* Members / Info */}
                        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Members — 42</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div className="avatar" style={{ width: '32px', height: '32px' }}></div>
                                    <span style={{ fontSize: '14px' }}>Alex Vector</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div className="avatar" style={{ width: '32px', height: '32px', background: '#333' }}></div>
                                    <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>GhostUser</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div >
        </div >
    );
};

export default DesignPreview;
