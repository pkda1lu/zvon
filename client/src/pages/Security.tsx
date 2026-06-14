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

const Security: React.FC = () => {
    const navigate = useNavigate();
    const brand = getIconBrand();

    return (
        <div className="docs-container" style={containerStyle}>
            <div className="policy-content" style={panelStyle}>
                <button onClick={() => navigate('/')} style={backBtnStyle}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    Назад на главную
                </button>

                <h1 style={h1Style}>Безопасность {brand.name}</h1>
                <p style={leadStyle}>
                    Безопасность — это фундамент {brand.name}. Мы строим инфраструктуру так, чтобы ваши разговоры, сообщения и личные данные оставались под вашим контролем на каждом этапе передачи и хранения.
                </p>

                <div style={{ display: 'grid', gap: '80px' }}>
                    <section>
                        <h2 style={h2Style}>Шифрование данных</h2>
                        <div style={bodyStyle}>
                            <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                                <li><strong>Транспортный уровень:</strong> Весь трафик между вашим устройством и серверами проходит по протоколам TLS 1.3 / HTTPS. Перехват данных в открытом виде невозможен.</li>
                                <li><strong>Голос и видео:</strong> Звонки строятся на WebRTC с обязательным шифрованием медиапотоков (DTLS-SRTP). Содержание разговоров не записывается и не хранится.</li>
                                <li><strong>Хранилище:</strong> Учётные данные хранятся в виде необратимых хешей, пароли никогда не сохраняются в открытом виде.</li>
                            </ul>
                        </div>
                    </section>

                    <section>
                        <h2 style={h2Style}>Защита аккаунта</h2>
                        <div style={bodyStyle}>
                            <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                                <li><strong>Двухфакторная аутентификация (2FA):</strong> Дополнительный код при входе защищает аккаунт, даже если пароль был скомпрометирован.</li>
                                <li><strong>Уведомления о входе:</strong> Вы получаете оповещение при входе с нового устройства или из непривычного местоположения.</li>
                                <li><strong>Управление сессиями:</strong> В любой момент вы можете завершить активные сессии на других устройствах.</li>
                            </ul>
                        </div>
                    </section>

                    <section>
                        <h2 style={h2Style}>Инфраструктура и устойчивость</h2>
                        <div style={bodyStyle}>
                            <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                                <li><strong>Изолированный доступ:</strong> Доступ к боевой инфраструктуре строго ограничен и требует многофакторной аутентификации.</li>
                                <li><strong>Мониторинг:</strong> Автоматические системы отслеживают подозрительную активность, спам и попытки злоупотреблений в реальном времени.</li>
                                <li><strong>Резервное копирование:</strong> Регулярные бэкапы защищают вашу историю переписок от потери данных.</li>
                            </ul>
                        </div>
                    </section>

                    <section style={{ marginBottom: '40px' }}>
                        <h2 style={h2Style}>Сообщить об уязвимости</h2>
                        <div style={bodyStyle}>
                            Мы ценим работу исследователей безопасности. Если вы обнаружили уязвимость, пожалуйста, сообщите нам напрямую — мы оперативно отреагируем.
                            <div style={{ marginTop: '24px' }}>
                                <span style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' }}>Email безопасности</span>
                                <a href="mailto:security@zvonserver.ru" style={{ color: 'var(--primary-neon)', textDecoration: 'none', fontWeight: 700 }}>security@zvonserver.ru</a>
                            </div>
                        </div>
                    </section>
                </div>

                <div style={{ marginTop: '100px', paddingTop: '40px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                    {brand.name} Platform • Security Center
                </div>
            </div>
        </div>
    );
};

export default Security;
