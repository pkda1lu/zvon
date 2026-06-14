import React from 'react';
import { getIconBrand } from '../utils/branding';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'https://zvonserver.ru';
const downloadUrl = (platform: string) => `${API_URL}/api/download/latest?platform=${platform}`;

const containerStyle: React.CSSProperties = { padding: '0 20px', minHeight: '100vh', display: 'flex', flexDirection: 'column' };
const panelStyle: React.CSSProperties = {
    background: 'rgba(13, 13, 15, 0.4)',
    backdropFilter: 'blur(40px) saturate(160%)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '32px',
    padding: '80px 60px',
    maxWidth: '1000px',
    width: '100%',
    margin: '100px auto',
    boxShadow: '0 32px 128px rgba(0,0,0,0.6)',
    color: '#fff',
    fontFamily: 'Inter, system-ui, sans-serif'
};
const backBtnStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff',
    padding: '12px 24px',
    borderRadius: '16px',
    cursor: 'pointer',
    marginBottom: '60px',
    fontWeight: 700,
    fontSize: '13px',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
};
const h1Style: React.CSSProperties = { fontSize: '48px', fontWeight: 900, marginBottom: '20px', letterSpacing: '-1.2px', background: 'linear-gradient(135deg, #fff 0%, #64748b 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' };
const leadStyle: React.CSSProperties = { fontSize: '20px', color: '#94a3b8', marginBottom: '80px', lineHeight: 1.6 };
const h2Style: React.CSSProperties = { color: 'var(--primary-neon, #00e5ff)', fontSize: '22px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2.5px', marginBottom: '32px', borderBottom: '1px solid rgba(0, 229, 255, 0.2)', paddingBottom: '12px' };
const bodyStyle: React.CSSProperties = { color: '#cbd5e1', lineHeight: '2', fontSize: '15.5px' };

const cardStyle: React.CSSProperties = {
    padding: '32px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '24px',
    border: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
};

const Download: React.FC = () => {
    const navigate = useNavigate();
    const brand = getIconBrand();
    const [latest, setLatest] = React.useState<string | null>(null);

    React.useEffect(() => {
        let alive = true;
        fetch(`${API_URL}/api/download/latest.json?platform=win`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (alive && d && d.version) setLatest(String(d.version).replace(/^v/, '')); })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    return (
        <div className="docs-container" style={containerStyle}>
            <div className="policy-content" style={panelStyle}>
                <button onClick={() => navigate('/')} style={backBtnStyle}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    Назад на главную
                </button>

                <h1 style={h1Style}>Загрузить {brand.name}</h1>
                <p style={leadStyle}>
                    {brand.name} доступен на всех ваших устройствах. Установщик всегда скачивает и ставит самую свежую версию автоматически, а после установки приложение обновляется самостоятельно.{latest ? ` Актуальная версия: ${latest}.` : ''}
                </p>

                <div style={{ display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginBottom: '80px' }}>
                    <div style={cardStyle}>
                        <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--primary-neon, #00e5ff)' }}>Десктоп</span>
                        <span style={{ fontSize: '22px', fontWeight: 900 }}>Windows</span>
                        <span style={{ color: '#94a3b8', fontSize: '14px' }}>Нативное приложение с фоновой работой, уведомлениями и горячими клавишами. Универсальный установщик — всегда последняя версия.</span>
                        <a href={downloadUrl('win')} style={{ marginTop: 'auto', textAlign: 'center', textDecoration: 'none', background: 'var(--primary-neon, #00e5ff)', color: '#05070a', border: 'none', padding: '14px 24px', borderRadius: '14px', cursor: 'pointer', fontWeight: 800, fontSize: '14px' }}>Скачать для Windows</a>
                    </div>

                    <div style={cardStyle}>
                        <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--primary-neon, #00e5ff)' }}>Браузер</span>
                        <span style={{ fontSize: '22px', fontWeight: 900 }}>Веб-версия</span>
                        <span style={{ color: '#94a3b8', fontSize: '14px' }}>Полный функционал без установки. Работает в любом современном браузере.</span>
                        <button onClick={() => navigate('/login')} style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', padding: '14px 24px', borderRadius: '14px', cursor: 'pointer', fontWeight: 800, fontSize: '14px' }}>Открыть в браузере</button>
                    </div>

                    <div style={cardStyle}>
                        <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#64748b' }}>Скоро</span>
                        <span style={{ fontSize: '22px', fontWeight: 900 }}>macOS · Linux</span>
                        <span style={{ color: '#94a3b8', fontSize: '14px' }}>Мы работаем над версиями для других платформ. Следите за обновлениями.</span>
                        <button disabled style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.02)', color: '#64748b', border: '1px solid rgba(255,255,255,0.06)', padding: '14px 24px', borderRadius: '14px', cursor: 'not-allowed', fontWeight: 800, fontSize: '14px' }}>В разработке</button>
                    </div>
                </div>

                <div style={{ display: 'grid', gap: '80px' }}>
                    <section style={{ marginBottom: '40px' }}>
                        <h2 style={h2Style}>Системные требования</h2>
                        <div style={bodyStyle}>
                            <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                                <li><strong>Windows:</strong> Windows 10 или новее, 64-бит.</li>
                                <li><strong>Веб-версия:</strong> Актуальная версия Chrome, Edge, Firefox или другого современного браузера.</li>
                                <li><strong>Сеть:</strong> Стабильное интернет-соединение для голосовых и видеозвонков.</li>
                            </ul>
                        </div>
                    </section>
                </div>

                <div style={{ marginTop: '60px', paddingTop: '40px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                    {brand.name} Platform • Downloads
                </div>
            </div>
        </div>
    );
};

export default Download;
