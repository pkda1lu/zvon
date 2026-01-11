import React from 'react';
import './PreviewStyles.css';

const LoginPreview: React.FC = () => {
    return (
        <div className="preview-container">
            <div className="preview-background" style={{
                backgroundImage: 'url("/redesign-assets/bg.png")',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: 0.6,
                zIndex: 0
            }}></div>

            {/* Decorative spheres to match invite/landing */}
            <div style={{ position: 'absolute', top: '15%', left: '15%', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, rgba(0, 229, 255, 0.4), transparent)', filter: 'blur(10px)', animation: 'float 10s infinite ease-in-out', zIndex: 1 }}></div>
            <div style={{ position: 'absolute', bottom: '20%', right: '15%', width: '180px', height: '180px', borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, rgba(161, 85, 255, 0.3), transparent)', filter: 'blur(10px)', animation: 'float 15s infinite ease-in-out reverse', zIndex: 1 }}></div>

            <div className="preview-layout" style={{ alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2 }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', padding: '50px', textAlign: 'center', marginTop: '40px' }}>
                    <div style={{ position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%)', width: '100px', height: '100px', background: 'var(--primary-neon)', borderRadius: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 40px rgba(0, 229, 255, 0.3)' }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>
                    </div>

                    <h1 style={{ marginTop: '20px', fontSize: '32px', fontWeight: 800, marginBottom: '10px' }}>Welcome Back</h1>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '40px', fontSize: '15px' }}>Enter your credentials to access the liquid matrix.</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
                        <div>
                            <div style={{ fontSize: '10px', color: 'var(--primary-neon)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px', marginLeft: '5px' }}>EMAIL OR PHONE</div>
                            <input type="text" style={{ width: '100%', padding: '15px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '16px', color: 'white', outline: 'none' }} placeholder="Enter your identifier" />
                        </div>
                        <div>
                            <div style={{ fontSize: '10px', color: 'var(--primary-neon)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px', marginLeft: '5px' }}>PASSWORD</div>
                            <input type="password" style={{ width: '100%', padding: '15px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '16px', color: 'white', outline: 'none' }} placeholder="••••••••" />
                            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--primary-neon)', cursor: 'pointer', textAlign: 'right', fontWeight: 600 }}>Forgot password?</div>
                        </div>
                    </div>

                    <button className="neon-btn" style={{ width: '100%', padding: '18px', fontSize: '16px', borderRadius: '20px', marginTop: '40px' }}>Authorize Access</button>

                    <div style={{ marginTop: '30px', fontSize: '14px', color: 'var(--text-muted)' }}>
                        New to the future? <span style={{ color: 'var(--primary-neon)', fontWeight: 800, cursor: 'pointer' }}>Construct account</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPreview;
