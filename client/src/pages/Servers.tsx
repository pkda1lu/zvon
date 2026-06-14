import React from 'react';
import { getIconBrand } from '../utils/branding';
import { useNavigate } from 'react-router-dom';

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

const Servers: React.FC = () => {
    const navigate = useNavigate();
    const brand = getIconBrand();

    return (
        <div className="docs-container" style={containerStyle}>
            <div className="policy-content" style={panelStyle}>
                <button onClick={() => navigate('/')} style={backBtnStyle}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    Назад на главную
                </button>

                <h1 style={h1Style}>Серверы и сообщества</h1>
                <p style={leadStyle}>
                    Серверы — это пространства для общения в {brand.name}. Создавайте сообщество для друзей, команды или большого проекта: гибкие каналы, роли и права доступа помогут организовать всё именно так, как вам нужно.
                </p>

                <div style={{ display: 'grid', gap: '80px' }}>
                    <section>
                        <h2 style={h2Style}>Каналы для всего</h2>
                        <div style={bodyStyle}>
                            <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                                <li><strong>Текстовые каналы:</strong> Обсуждения, обмен файлами, изображениями и ссылками с полной историей сообщений.</li>
                                <li><strong>Голосовые каналы:</strong> Заходите в голос одним кликом, общайтесь без задержек и делитесь экраном в высоком качестве.</li>
                                <li><strong>Категории:</strong> Группируйте каналы по темам, чтобы навигация по серверу оставалась удобной даже при росте сообщества.</li>
                            </ul>
                        </div>
                    </section>

                    <section>
                        <h2 style={h2Style}>Роли и права доступа</h2>
                        <div style={bodyStyle}>
                            <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                                <li><strong>Гибкие роли:</strong> Назначайте участникам роли с собственным цветом и набором прав — от модераторов до гостей.</li>
                                <li><strong>Точечные права:</strong> Управляйте доступом к отдельным каналам, чтобы открытые и закрытые пространства сосуществовали на одном сервере.</li>
                                <li><strong>Модерация:</strong> Инструменты для управления участниками помогают поддерживать здоровую атмосферу в сообществе.</li>
                            </ul>
                        </div>
                    </section>

                    <section>
                        <h2 style={h2Style}>Приглашения</h2>
                        <div style={bodyStyle}>
                            Делитесь сервером с помощью ссылок-приглашений. Вы контролируете срок их действия и можете отозвать доступ в любой момент. Новые участники присоединяются в один клик — без сложных настроек.
                        </div>
                    </section>

                    <section style={{ marginBottom: '40px' }}>
                        <h2 style={h2Style}>Создайте свой сервер</h2>
                        <div style={bodyStyle}>
                            Готовы собрать своё сообщество? Зарегистрируйтесь и создайте сервер за пару минут — это бесплатно.
                            <div style={{ marginTop: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                <button onClick={() => navigate('/register')} style={{ background: 'var(--primary-neon, #00e5ff)', color: '#05070a', border: 'none', padding: '14px 28px', borderRadius: '16px', cursor: 'pointer', fontWeight: 800, fontSize: '14px' }}>Создать аккаунт</button>
                                <button onClick={() => navigate('/login')} style={{ ...backBtnStyle, marginBottom: 0 }}>Войти</button>
                            </div>
                        </div>
                    </section>
                </div>

                <div style={{ marginTop: '100px', paddingTop: '40px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                    {brand.name} Platform • Servers & Communities
                </div>
            </div>
        </div>
    );
};

export default Servers;
