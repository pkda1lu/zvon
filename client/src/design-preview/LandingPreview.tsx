import React from 'react';
import './PreviewStyles.css';

const LandingPreview: React.FC = () => {
    return (
        <div className="preview-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
            <div className="preview-background"></div>

            <div className="glass-panel floating" style={{ width: '400px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative', zIndex: 2 }}>
                <div className="logo-area" style={{ justifyContent: 'center', fontSize: '32px' }}>
                    <svg className="logo-bell" width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                    <span style={{ background: 'linear-gradient(to right, #00d2ff, #9d50bb)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Zvon</span>
                </div>

                <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
                    Experience the next generation of communication. Fast, fluid, and beautifully transparent.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button className="neon-btn" style={{ padding: '14px' }}>Get Started</button>
                    <button style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'white', padding: '12px', borderRadius: '12px', cursor: 'pointer' }}>
                        Learn More
                    </button>
                </div>

                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
                    Design Refresh v1.0 — Preview Mode
                </div>
            </div>

            {/* Decorative spheres */}
            <div style={{ position: 'absolute', top: '10%', left: '10%', width: '100px', height: '100px', borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, rgba(0, 210, 255, 0.4), transparent)', filter: 'blur(5px)', animation: 'float 8s infinite ease-in-out' }}></div>
            <div style={{ position: 'absolute', bottom: '15%', right: '12%', width: '150px', height: '150px', borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%, rgba(157, 80, 187, 0.3), transparent)', filter: 'blur(5px)', animation: 'float 12s infinite ease-in-out reverse' }}></div>
        </div>
    );
};

export default LandingPreview;
