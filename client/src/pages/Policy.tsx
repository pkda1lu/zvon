import React from 'react';
import { useNavigate } from 'react-router-dom';

const Policy: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="docs-container" style={{ padding: '0 20px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div className="policy-content" style={{
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
            }}>
                <button 
                  onClick={() => navigate('/')} 
                  style={{
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
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  Назад на главную
                </button>

                <h1 style={{ fontSize: '48px', fontWeight: 900, marginBottom: '20px', letterSpacing: '-1px', background: 'linear-gradient(135deg, #fff 0%, #64748b 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Условия использования</h1>
                <p className="lead" style={{ fontSize: '20px', color: '#94a3b8', marginBottom: '80px', lineHeight: 1.6 }}>
                    Добро пожаловать в Zvon! Ниже приведены правила и условия, регулирующие использование нашего сервиса. Пожалуйста, внимательно ознакомьтесь с ними.
                </p>

                <div className="policy-sections" style={{ display: 'grid', gap: '60px' }}>
                    <section>
                        <h2 style={{ color: 'var(--primary-neon, #00e5ff)', fontSize: '22px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '24px' }}>1. Принятие условий</h2>
                        <div style={{ color: '#cbd5e1', lineHeight: 1.8, fontSize: '15px' }}>
                            Создавая учетную запись или используя Zvon, вы соглашаетесь соблюдать настоящие условия. Если вы не согласны с любым пунктом, вы должны прекратить использование сервиса.
                        </div>
                    </section>

                    <section>
                        <h2 style={{ color: 'var(--primary-neon, #00e5ff)', fontSize: '22px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '24px' }}>2. Правила поведения и модерация</h2>
                        <div style={{ color: '#cbd5e1', lineHeight: 1.8, fontSize: '15px' }}>
                            Zvon стремится быть безопасным пространством. Категорически запрещено:
                            <ul style={{ marginTop: '16px', listStyle: 'none', paddingLeft: 0, display: 'grid', gap: '10px' }}>
                                <li style={{ display: 'flex', gap: '12px' }}>
                                  <span style={{ color: 'var(--primary-neon)' }}>•</span>
                                  <span>Оскорбления, домогательства (harassment) и разжигание ненависти.</span>
                                </li>
                                <li style={{ display: 'flex', gap: '12px' }}>
                                  <span style={{ color: 'var(--primary-neon)' }}>•</span>
                                  <span>Рассылка спама, вредоносного ПО и фишинговых ссылок.</span>
                                </li>
                                <li style={{ display: 'flex', gap: '12px' }}>
                                  <span style={{ color: 'var(--primary-neon)' }}>•</span>
                                  <span>Публикация незаконного, шокирующего или неприемлемого контента.</span>
                                </li>
                                <li style={{ display: 'flex', gap: '12px' }}>
                                  <span style={{ color: 'var(--primary-neon)' }}>•</span>
                                  <span>Попытки взлома сервиса или нарушение его нормальной работы.</span>
                                </li>
                            </ul>
                            <div style={{ marginTop: '20px', padding: '20px', background: 'rgba(255, 61, 61, 0.05)', borderRadius: '16px', border: '1px solid rgba(255, 61, 61, 0.1)', color: '#fda4af' }}>
                                <strong>Внимание:</strong> Модераторы имеют право выдавать временные или бессрочные блокировки (баны) за нарушение правил. Решение модератора может быть пересмотрено в исключительных случаях.
                            </div>
                        </div>
                    </section>

                    <section>
                        <h2 style={{ color: 'var(--primary-neon, #00e5ff)', fontSize: '22px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '24px' }}>3. Приватность и Безопасность</h2>
                        <div style={{ color: '#cbd5e1', lineHeight: 1.8, fontSize: '15px' }}>
                            Ваша приватность — наш приоритет:
                            <ul style={{ marginTop: '16px', listStyle: 'none', paddingLeft: 0, display: 'grid', gap: '10px' }}>
                                <li style={{ display: 'flex', gap: '12px' }}>
                                  <span style={{ color: 'var(--primary-neon)' }}>•</span>
                                  <span>Мы не передаем ваши личные сообщения третьим лицам.</span>
                                </li>
                                <li style={{ display: 'flex', gap: '12px' }}>
                                  <span style={{ color: 'var(--primary-neon)' }}>•</span>
                                  <span>Пароли хранятся в зашифрованном виде.</span>
                                </li>
                                <li style={{ display: 'flex', gap: '12px' }}>
                                  <span style={{ color: 'var(--primary-neon)' }}>•</span>
                                  <span>Регистрация требует email для безопасности вашего аккаунта и восстановления доступа.</span>
                                </li>
                            </ul>
                        </div>
                    </section>

                    <section>
                        <h2 style={{ color: 'var(--primary-neon, #00e5ff)', fontSize: '22px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '24px' }}>4. Права на контент</h2>
                        <div style={{ color: '#cbd5e1', lineHeight: 1.8, fontSize: '15px' }}>
                            Вы сохраняете все права на контент (текст, изображения), который вы публикуете в приложении. Однако, загружая контент, вы предоставляете Zvon лицензию на его обработку и хранение в рамках функционирования сервиса.
                        </div>
                    </section>

                    <section>
                        <h2 style={{ color: 'var(--primary-neon, #00e5ff)', fontSize: '22px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '24px' }}>5. Ограничение ответственности</h2>
                        <div style={{ color: '#cbd5e1', lineHeight: 1.8, fontSize: '15px' }}>
                            Zvon предоставляется «как есть». Мы не несем ответственности за косвенные убытки, упущенную выгоду или эмоциональный вред, возникший в результате использования или невозможности использования сервиса.
                        </div>
                    </section>

                    <section>
                        <h2 style={{ color: 'var(--primary-neon, #00e5ff)', fontSize: '22px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '24px' }}>6. Изменение условий</h2>
                        <div style={{ color: '#cbd5e1', lineHeight: 1.8, fontSize: '15px' }}>
                            Мы можем обновлять данные условия время от времени. Дальнейшее использование сервиса после изменений означает ваше согласие с новыми правилами.
                        </div>
                    </section>
                </div>

                <div style={{ marginTop: '100px', paddingTop: '40px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                    Последнее обновление: {new Date().toLocaleDateString('ru-RU')} • Zvon Team © 2026
                </div>
            </div>
        </div>
    );
};

export default Policy;
