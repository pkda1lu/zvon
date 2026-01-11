import React, { useState } from 'react';
import './PreviewStyles.css';

const SettingsPreview: React.FC = () => {
    const [activeTab, setActiveTab] = useState('Appearance');

    return (
        <div className="preview-container">
            <div className="preview-background"></div>

            <div className="settings-layout">
                <aside className="settings-sidebar">
                    <div style={{ marginBottom: '30px', padding: '0 30px' }}>
                        <div style={{ fontSize: '32px', fontWeight: 800, color: 'white', letterSpacing: '-1.5px', lineHeight: '1.1' }}>Settings</div>
                        <div style={{ fontSize: '11px', color: 'var(--primary-neon)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginTop: '4px' }}>Zvon core v.2.4.0</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                        <div>
                            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '15px', padding: '0 30px' }}>USER CORE</div>
                            {['My Account', 'Security', 'Privacy'].map(tab => (
                                <div key={tab} className={`settings-nav-item ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>{tab}</div>
                            ))}
                        </div>

                        <div>
                            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '15px', padding: '0 30px' }}>INTERFACE</div>
                            {['Appearance', 'Voice & Video', 'Advanced'].map(tab => (
                                <div key={tab} className={`settings-nav-item ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>{tab}</div>
                            ))}
                        </div>
                    </div>
                </aside>

                <main className="settings-content">
                    <div className="settings-section">
                        <h2>Personalization</h2>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                            <div className="settings-card">
                                <div className="toggle-row">
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '16px', color: 'white' }}>Neural Interface Rendering</div>
                                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>Use GPU-accelerated glassmorphism and neural blurs.</div>
                                    </div>
                                    <div className="toggle-switch on"></div>
                                </div>
                                <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '20px 0' }}></div>
                                <div className="toggle-row">
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '16px', color: 'white' }}>Ambient Light Transmission</div>
                                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>Sync interface highlights with active content.</div>
                                    </div>
                                    <div className="toggle-switch"></div>
                                </div>
                                <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '20px 0' }}></div>
                                <div className="toggle-row">
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '16px', color: 'white' }}>High-Depth Refraction</div>
                                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>Enable multi-pass refraction for liquid elements.</div>
                                    </div>
                                    <div className="toggle-switch on"></div>
                                </div>
                            </div>

                            <div className="settings-card" style={{ background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.03), rgba(161, 85, 255, 0.03))' }}>
                                <div style={{ fontWeight: 700, fontSize: '18px', marginBottom: '25px', color: 'white' }}>Spectral Transmission Theme</div>
                                <div style={{ display: 'flex', gap: '20px' }}>
                                    {[
                                        { color: '#00d2ff', name: 'Cyber Blue' },
                                        { color: '#9d50bb', name: 'Vortex' },
                                        { color: '#ff00cc', name: 'Neon Pink' }
                                    ].map(theme => (
                                        <div key={theme.name} style={{ flex: 1, padding: '15px', borderRadius: '16px', border: theme.name === 'Cyber Blue' ? '1px solid #00d2ff' : '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)', textAlign: 'center', cursor: 'pointer' }}>
                                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: theme.color, margin: '0 auto 10px', boxShadow: `0 0 15px ${theme.color}44` }}></div>
                                            <div style={{ fontSize: '11px', color: theme.name === 'Cyber Blue' ? 'white' : 'var(--text-muted)' }}>{theme.name}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* Premium Exit Button */}
            <div style={{ position: 'absolute', top: '40px', right: '40px', width: '50px', height: '50px', borderRadius: '18px', background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)', zIndex: 10 }} className="sidebar-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </div>
        </div>
    );
};

export default SettingsPreview;
