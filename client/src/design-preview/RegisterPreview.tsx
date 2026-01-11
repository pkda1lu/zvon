import React from 'react';
import './PreviewStyles.css';

const RegisterPreview: React.FC = () => {
    return (
        <div className="preview-container">
            <div className="preview-background" style={{
                backgroundImage: 'url("/redesign-assets/bg.png")',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: 0.6,
                zIndex: 0
            }}></div>

            {/* Decorative spheres */}
            <div style={{ position: 'absolute', top: '10%', right: '15%', width: '140px', height: '140px', borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, rgba(0, 229, 255, 0.4), transparent)', filter: 'blur(10px)', animation: 'float 12s infinite ease-in-out', zIndex: 1 }}></div>
            <div style={{ position: 'absolute', bottom: '15%', left: '10%', width: '200px', height: '200px', borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, rgba(161, 85, 255, 0.3), transparent)', filter: 'blur(10px)', animation: 'float 18s infinite ease-in-out reverse', zIndex: 1 }}></div>

            <div className="preview-layout" style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2 }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '50px', textAlign: 'center', marginTop: '40px' }}>
                    <div style={{ position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%)', width: '100px', height: '100px', background: 'var(--primary-neon)', borderRadius: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 40px rgba(0, 229, 255, 0.3)' }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" /></svg>
                    </div>

                    <h1 style={{ marginTop: '20px', fontSize: '32px', fontWeight: 800, marginBottom: '10px' }}>Initiate Account</h1>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '40px', fontSize: '15px' }}>Begin your journey into the beautifully transparent ecosystem.</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
                        <div>
                            <div style={{ fontSize: '10px', color: 'var(--primary-neon)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px', marginLeft: '5px' }}>EMAIL</div>
                            <input type="email" style={{ width: '100%', padding: '15px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '16px', color: 'white', outline: 'none' }} placeholder="your@email.com" />
                        </div>
                        <div>
                            <div style={{ fontSize: '10px', color: 'var(--primary-neon)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px', marginLeft: '5px' }}>USERNAME</div>
                            <input type="text" style={{ width: '100%', padding: '15px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '16px', color: 'white', outline: 'none' }} placeholder="CyberNaut" />
                        </div>
                        <div>
                            <div style={{ fontSize: '10px', color: 'var(--primary-neon)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px', marginLeft: '5px' }}>PASSWORD</div>
                            <input type="password" style={{ width: '100%', padding: '15px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '16px', color: 'white', outline: 'none' }} placeholder="••••••••" />
                        </div>
                    </div>

                    <p style={{ marginTop: '20px', fontSize: '12px', color: 'rgba(255,255,255,0.3)', textAlign: 'left', lineHeight: '1.4' }}>
                        By proceeding, you agree to our <span style={{ color: 'var(--primary-neon)' }}>Protocol Terms</span> and <span style={{ color: 'var(--primary-neon)' }}>Privacy Nodes</span>.
                    </p>

                    <button className="neon-btn" style={{ width: '100%', padding: '18px', fontSize: '16px', borderRadius: '20px', marginTop: '30px' }}>Construct Account</button>

                    <div style={{ marginTop: '30px', fontSize: '14px', color: 'var(--text-muted)' }}>
                        Already authenticated? <span style={{ color: 'var(--primary-neon)', fontWeight: 800, cursor: 'pointer' }}>Authorize</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RegisterPreview;
