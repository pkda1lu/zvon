import React from 'react';
import './PreviewStyles.css';

const FriendsPreview: React.FC = () => {
    return (
        <div className="preview-container">
            <div className="preview-background"></div>
            <div className="preview-layout">
                <aside className="preview-sidebar">
                    <div className="sidebar-icon active"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg></div>
                    <div className="sidebar-icon"><div className="avatar" style={{ width: '32px', height: '32px' }}></div></div>
                </aside>

                <main className="preview-main">
                    <header className="preview-topbar">
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                Friends
                            </div>
                            <div style={{ height: '24px', width: '1px', background: 'var(--glass-border)' }}></div>
                            <div style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
                                <span style={{ color: 'var(--primary-neon)', cursor: 'pointer' }}>Online</span>
                                <span style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>All</span>
                                <span style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>Pending</span>
                                <span style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>Blocked</span>
                            </div>
                        </div>
                        <button className="neon-btn">Add Friend</button>
                    </header>

                    <div className="content-grid" style={{ gridTemplateColumns: '1fr 340px' }}>
                        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Online — 3</div>
                            {[
                                { name: 'Alex Vector', status: 'Playing Cyberpunk 2077', color: '#00d2ff' },
                                { name: 'Sarah_Design', status: 'Online', color: '#ff00cc' },
                                { name: 'RetroGamer', status: 'Listening to Spotify', color: '#9d50bb' }
                            ].map((friend, i) => (
                                <div key={i} className="message-card" style={{ alignItems: 'center', cursor: 'pointer' }}>
                                    <div className="avatar" style={{ background: `linear-gradient(45deg, ${friend.color}, #333)` }}></div>
                                    <div style={{ flex: 1 }}>
                                        <div className="username">{friend.name}</div>
                                        <div className="timestamp" style={{ fontSize: '12px' }}>{friend.status}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <div className="sidebar-icon" style={{ width: '32px', height: '32px' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></div>
                                        <div className="sidebar-icon" style={{ width: '32px', height: '32px' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg></div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="glass-panel">
                            <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Active Now</h3>
                            <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', textAlign: 'center' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>It's quiet for now... When friends start an activity, it will show up here!</div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default FriendsPreview;
