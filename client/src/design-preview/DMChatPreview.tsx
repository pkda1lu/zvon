import React from 'react';
import './PreviewStyles.css';

const DMChatPreview: React.FC = () => {
    return (
        <div className="preview-container">
            <div className="preview-background"></div>
            <div className="preview-layout">
                {/* Sidebar */}
                <aside className="preview-sidebar">
                    <div className="sidebar-icon active">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
                    </div>
                    <div className="sidebar-icon">
                        <div className="avatar" style={{ width: '32px', height: '32px', background: 'linear-gradient(45deg, #00d2ff, #9d50bb)' }}></div>
                    </div>
                    <div className="sidebar-icon">
                        <div className="avatar" style={{ width: '32px', height: '32px', background: 'linear-gradient(45deg, #ff00cc, #333)' }}></div>
                    </div>
                </aside>

                <main className="preview-main">
                    {/* Topbar */}
                    <header className="preview-topbar">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div className="avatar" style={{ width: '40px', height: '40px', border: '2px solid var(--primary-neon)' }}></div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '18px' }}>Alex Vector</div>
                                <div style={{ fontSize: '12px', color: '#4caf50', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4caf50' }}></span>
                                    Online
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '16px' }}>
                            <div className="sidebar-icon" style={{ width: '40px', height: '40px' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" /></svg>
                            </div>
                            <div className="sidebar-icon" style={{ width: '40px', height: '40px' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
                            </div>
                            <div className="sidebar-icon" style={{ width: '40px', height: '40px' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                            </div>
                        </div>
                    </header>

                    {/* Chat Layout */}
                    <div className="content-grid" style={{ gridTemplateColumns: '260px 1fr' }}>
                        {/* DM List */}
                        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.2)', letterSpacing: '2px', marginBottom: '10px' }}>DIRECT MESSAGES</div>
                            {[
                                { name: 'Alex Vector', status: 'Online', active: true },
                                { name: 'Sarah_Design', status: 'Away', active: false },
                                { name: 'CyberNaut', status: 'In Game', active: false },
                                { name: 'Anotra', status: 'Invisible', active: false }
                            ].map((dm, i) => (
                                <div key={i} className={`settings-nav-item ${dm.active ? 'active' : ''}`} style={{ padding: '10px 15px', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div className="avatar" style={{ width: '32px', height: '32px', background: dm.active ? 'var(--primary-neon)' : '#333' }}></div>
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        <div style={{ fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dm.name}</div>
                                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{dm.status}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Personal Conversation */}
                        <div className="glass-panel chat-area" style={{ padding: '40px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '60px', textAlign: 'center' }}>
                                <div className="avatar" style={{ width: '100px', height: '100px', marginBottom: '20px', border: '4px solid var(--primary-neon)', boxShadow: '0 0 30px rgba(0, 229, 255, 0.2)' }}></div>
                                <div style={{ fontSize: '28px', fontWeight: 800 }}>Alex Vector</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '400px', marginTop: '10px' }}>This is the beginning of your legendary conversation with Alex. No more secrets, just pure glassmorphism.</div>
                            </div>

                            <div className="message-card">
                                <div className="avatar"></div>
                                <div>
                                    <div className="message-header">
                                        <span className="username">Alex Vector</span>
                                        <span className="timestamp">11:04 AM</span>
                                    </div>
                                    <div className="message-text">
                                        Hey! Have you seen the new Liquid Glass design in the Zvon update? It looks absolutely futuristic.
                                    </div>
                                </div>
                            </div>

                            <div className="message-card">
                                <div className="avatar" style={{ background: 'var(--primary-neon)' }}></div>
                                <div>
                                    <div className="message-header">
                                        <span className="username" style={{ color: 'var(--primary-neon)' }}>You</span>
                                        <span className="timestamp">11:05 AM</span>
                                    </div>
                                    <div className="message-text">
                                        Yeah, I'm literally looking at it right now. The way everything flows and the blurs... it's like using an OS from 2026.
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: 'auto', display: 'flex', gap: '15px' }}>
                                <div className="sidebar-icon" style={{ width: '45px', height: '45px', borderRadius: '15px' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                                </div>
                                <div style={{ flex: 1, padding: '12px 25px', background: 'rgba(255,255,255,0.02)', borderRadius: '20px', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center' }}>
                                    <input type="text" style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', outline: 'none' }} placeholder="Message @Alex Vector" />
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--primary-neon)', marginLeft: '15px' }}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default DMChatPreview;
