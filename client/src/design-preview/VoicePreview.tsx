import React from 'react';
import './PreviewStyles.css';

const VoicePreview: React.FC = () => {
    return (
        <div className="preview-container">
            <div className="preview-background"></div>
            <div className="preview-layout" style={{ flexDirection: 'column' }}>
                <header className="preview-topbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ padding: '8px 16px', background: 'rgba(76, 175, 80, 0.15)', color: '#4caf50', borderRadius: '100px', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase', border: '1px solid rgba(76, 175, 80, 0.3)' }}>Secure Connection</div>
                        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Design Synapse</h1>
                    </div>
                </header>

                <main className="voice-grid">
                    <div className="video-slot" style={{ border: '1px solid rgba(0, 210, 255, 0.5)', background: 'rgba(0,0,0,0.4)' }}>
                        <div className="avatar" style={{ width: '120px', height: '120px', border: '4px solid var(--primary-neon)', boxShadow: '0 0 40px rgba(0, 210, 255, 0.3)' }}></div>
                        <div className="video-label">Alex Vector (Host)</div>
                        <div style={{ position: 'absolute', top: '24px', right: '24px', color: 'var(--primary-neon)' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
                        </div>
                    </div>

                    <div className="video-slot">
                        <div className="avatar" style={{ width: '120px', height: '120px', background: 'linear-gradient(135deg, #ff00cc, #333)' }}></div>
                        <div className="video-label">Sarah_Design</div>
                    </div>

                    <div className="video-slot">
                        <div style={{ width: '100%', height: '100%', background: 'rgba(0,0,0,0.6) url("https://images.unsplash.com/photo-1614850523296-d8c1af93d400?ixlib=rb-1.2.1&auto=format&fit=crop&w=1000&q=80") center/cover', filter: 'brightness(0.7)' }}></div>
                        <div className="video-label">CyberNaut's Space</div>
                        <div style={{ position: 'absolute', top: '24px', left: '24px', background: 'var(--primary-neon)', color: 'black', padding: '4px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }}>STREAMING 4K</div>
                    </div>
                </main>

                <div className="call-controls">
                    <button className="control-btn"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg></button>
                    <button className="control-btn"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg></button>
                    <button className="control-btn active"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg></button>
                    <button className="control-btn" style={{ background: 'rgba(255,255,255,0.05)' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a3 3 0 0 1 3 3 3 3 0 0 1-3 3h-1a3 3 0 0 1-3-3 3 3 0 0 1 3-3h1z" /><path d="M10 8a3 3 0 0 1 3 3 3 3 0 0 1-3 3H9a3 3 0 0 1-3-3 3 3 0 0 1 3-3h1z" /></svg></button>
                    <div style={{ width: '1px', height: '30px', background: 'rgba(255,255,255,0.1)' }}></div>
                    <button className="control-btn end-call"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" /></svg></button>
                </div>
            </div>
        </div>
    );
};

export default VoicePreview;
