import React from 'react';
import { getIconBrand } from '../utils/branding';
import { useNavigate } from 'react-router-dom';
// Страница использует класс .docs-container из Docs.css (высота и прокрутка).
// Без явного импорта стили не попадают в её чанк и страница не прокручивается.
import './Docs.css';

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

const About: React.FC = () => {
    const navigate = useNavigate();
    const brand = getIconBrand();

    return (
        <div className="docs-container" style={containerStyle}>
            <div className="policy-content" style={panelStyle}>
                <button onClick={() => navigate('/')} style={backBtnStyle}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    Назад на главную
                </button>

                <h1 style={h1Style}>О нас</h1>
                <p style={leadStyle}>
                    {brand.name} — это современная платформа для общения, голосовых и видеозвонков. Мы создаём пространство, где люди и сообщества могут свободно и безопасно оставаться на связи.
                </p>

                <div style={{ display: 'grid', gap: '80px' }}>
                    <section>
                        <h2 style={h2Style}>Наша миссия</h2>
                        <div style={bodyStyle}>
                            Мы верим, что качественное общение не должно быть компромиссом между удобством, скоростью и приватностью. {brand.name} объединяет текстовые чаты, кристально чистый голос, видео и демонстрацию экрана в одном лёгком приложении — без перегруженного интерфейса и лишней нагрузки на устройство.
                        </div>
                    </section>

                    <section>
                        <h2 style={h2Style}>Что мы ценим</h2>
                        <div style={bodyStyle}>
                            <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                                <li><strong>Приватность:</strong> Ваши данные принадлежат вам. Мы не продаём информацию и не показываем рекламу.</li>
                                <li><strong>Производительность:</strong> Приложение работает быстро даже на слабом железе и при нестабильном интернете.</li>
                                <li><strong>Открытость:</strong> Мы прислушиваемся к сообществу и развиваем продукт вместе с пользователями.</li>
                            </ul>
                        </div>
                    </section>

                    <section>
                        <h2 style={h2Style}>Технологии</h2>
                        <div style={bodyStyle}>
                            {brand.name} построен на современном стеке: real-time инфраструктура на базе WebRTC и LiveKit обеспечивает звонки с низкой задержкой, а кроссплатформенный клиент работает и в браузере, и как настольное приложение. Мы постоянно оптимизируем нагрузку на сеть и процессор, чтобы общение оставалось плавным.
                        </div>
                    </section>

                    <section style={{ marginBottom: '40px' }}>
                        <h2 style={h2Style}>Связаться с нами</h2>
                        <div style={bodyStyle}>
                            У вас есть вопрос, идея или предложение? Мы всегда рады обратной связи.
                            <div style={{ marginTop: '24px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                                <div>
                                    <span style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' }}>Email</span>
                                    <a href="mailto:support@zvonserver.ru" style={{ color: 'var(--primary-neon)', textDecoration: 'none', fontWeight: 700 }}>support@zvonserver.ru</a>
                                </div>
                                <div>
                                    <span style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' }}>Администрация</span>
                                    <span style={{ color: '#fff', fontWeight: 700 }}>@da1lu</span>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <div style={{ marginTop: '100px', paddingTop: '40px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                    {brand.name} Platform • About Us
                </div>
            </div>
        </div>
    );
};

export default About;
