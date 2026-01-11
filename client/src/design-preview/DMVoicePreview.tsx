import React from 'react';
import './PreviewStyles.css';

const DMVoicePreview: React.FC = () => {
    return (
        <div className="preview-container">
            <div className="preview-background"></div>
            <div className="preview-layout" style={{ flexDirection: 'column' }}>
                <header className="preview-topbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div className="sidebar-icon" style={{ width: '40px', height: '40px' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '20px' }}>Direct Call: Alex Vector</div>
                    </div>
                </header>

                <main style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 40px', position: 'relative' }}>
                    <div className="video-slot" style={{ width: '100%', height: '100%', maxWidth: '1200px', maxHeight: '720px', flex: 'none' }}>
                        <div style={{ width: '100%', height: '100%', background: 'rgba(0,0,0,0.6) url("https://images.unsplash.com/photo-1550745165-9bc0b252726f?ixlib=rb-1.2.1&auto=format&fit=crop&w=1200&q=80") center/cover', filter: 'brightness(0.6)' }}></div>

                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="avatar" style={{ width: '160px', height: '160px', border: '6px solid var(--primary-neon)', boxShadow: '0 0 50px rgba(0, 229, 255, 0.3)', marginBottom: '30px' }}></div>
                            <div style={{ fontSize: '32px', fontWeight: 800, textShadow: '0 5px 15px rgba(0,0,0,0.5)' }}>Alex Vector</div>
                            <div style={{ color: 'var(--primary-neon)', fontWeight: 600, marginTop: '10px', letterSpacing: '2px', fontSize: '14px' }}>SPEAKING...</div>
                        </div>

                        {/* Picture in Picture (Self) */}
                        <div className="video-slot" style={{ position: 'absolute', bottom: '30px', right: '30px', width: '280px', height: '180px', flex: 'none', border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 15px 40px rgba(0,0,0,0.5)' }}>
                            <div className="avatar" style={{ width: '60px', height: '60px' }}></div>
                            <div className="video-label">You</div>
                        </div>
                    </div>
                </main>

                <div className="call-controls" style={{ bottom: '60px' }}>
                    <button className="control-btn"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg></button>
                    <button className="control-btn"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg></button>
                    <button className="control-btn"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg></button>
                    <div style={{ width: '1px', height: '30px', background: 'rgba(255,255,255,0.1)' }}></div>
                    <button className="control-btn end-call" style={{ width: '70px', borderRadius: '25px' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" /></svg></button>
                </div>
            </div>
        </div>
    );
};

export default DMVoicePreview;
