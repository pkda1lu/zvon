import React from 'react';
import './PreviewStyles.css';

const InvitePreview: React.FC = () => {
    return (
        <div className="preview-container">
            <div className="preview-background" style={{
                backgroundImage: 'url("/redesign-assets/bg.png")',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: 0.6,
                zIndex: 0
            }}></div>

            {/* Decorative spheres to match landing */}
            <div style={{ position: 'absolute', top: '15%', left: '15%', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, rgba(0, 229, 255, 0.4), transparent)', filter: 'blur(10px)', animation: 'float 10s infinite ease-in-out', zIndex: 1 }}></div>
            <div style={{ position: 'absolute', bottom: '20%', right: '15%', width: '180px', height: '180px', borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, rgba(161, 85, 255, 0.3), transparent)', filter: 'blur(10px)', animation: 'float 15s infinite ease-in-out reverse', zIndex: 1 }}></div>

            <div className="preview-layout" style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2 }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '50px', textAlign: 'center', marginTop: '40px' }}>
                    <div style={{ position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%)', width: '100px', height: '100px', background: 'var(--primary-neon)', borderRadius: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 40px rgba(0, 229, 255, 0.3)' }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
                    </div>

                    <h1 style={{ marginTop: '20px', fontSize: '32px', fontWeight: 800 }}>Join the Matrix</h1>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '40px', fontSize: '15px' }}>Alex Vector invited you to join their private server. Be part of the liquid future.</p>

                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '20px', padding: '20px', marginBottom: '30px', position: 'relative' }}>
                        <div style={{ fontSize: '10px', color: 'var(--primary-neon)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '10px' }}>INVITE LINK</div>
                        <div style={{ fontSize: '18px', fontWeight: 600, color: 'white' }}>zvon.app/redesign-2026</div>
                        <div style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', padding: '8px 15px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}>COPY</div>
                    </div>

                    <button className="neon-btn" style={{ width: '100%', padding: '18px', fontSize: '16px', borderRadius: '20px' }}>Accept Invitation</button>

                    <div style={{ marginTop: '30px', fontSize: '12px', color: 'rgba(255,255,255,0.2)' }}>
                        This invite link will expire in 24 hours.
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InvitePreview;
