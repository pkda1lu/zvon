import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getBrand } from '../utils/branding';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Landing3D from '../components/Landing3D';
import PromoReel from '../components/PromoReel';
import ScreenshotReel, { ReelSlide } from '../components/ScreenshotReel';
import './Landing.css';

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const fadeUp = {
    hidden: { opacity: 0, y: 40 },
    show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.08, ease: EASE } }),
};

const Landing: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const brand = getBrand();
    const isMax = brand.id === 'maxcord';
    const base = import.meta.env.BASE_URL;
    const heroImg = `${base}${isMax ? 'maxcord/landing_hero.png' : 'landing_hero.png'}`;
    // Промо-видео в секции (опционально): client/public/promo.mp4
    const promoSrc = `${base}promo.mp4`;

    // Ролик из твоих скриншотов: положи PNG/JPG в client/public/promo/ и
    // перечисли их здесь (подписи можно менять). Чего нет — то пропустится;
    // если совсем пусто — покажется сгенерированный ролик.
    const SHOTS: ReelSlide[] = [
        { src: `${base}promo/1.png`, title: 'Голосовые каналы', sub: 'Кристальный звук и видеосвязь' },
        { src: `${base}promo/2.png`, title: 'Свой сервер', sub: 'Каналы, роли и права под тебя' },
        { src: `${base}promo/3.png`, title: 'Демонстрация экрана', sub: 'Стриминг в 4K/60fps' },
        { src: `${base}promo/4.png`, title: 'Боты и мини-приложения', sub: 'Музыка, магазин, модерация' },
        { src: `${base}promo/5.png`, title: brand.name, sub: 'Присоединяйся бесплатно' },
    ];

    const [videoOpen, setVideoOpen] = useState(false);
    const [promoOk, setPromoOk] = useState(true);

    const handleOpenApp = () => navigate(user ? '/app' : '/login');

    return (
        <div className="landing-container landing-cine">
            {/* Фиксированный 3D-фон: планета едет по углам при скролле */}
            <Landing3D className="landing-bg-3d" />
            <div className="landing-bg-veil" />

            <nav className="landing-nav">
                <div className="nav-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    <img src={`${base}${brand.favicon}`} alt={brand.name} />
                    <span>{brand.name}</span>
                </div>
                <div className="nav-links">
                    <span className="nav-link" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>Возможности</span>
                    <span className="nav-link" onClick={() => document.getElementById('reel')?.scrollIntoView({ behavior: 'smooth' })}>Видео</span>
                    <span className="nav-link" onClick={() => document.getElementById('showcase')?.scrollIntoView({ behavior: 'smooth' })}>Демонстрация</span>
                    <span className="nav-link" onClick={() => navigate('/docs')}>Документация</span>
                </div>
                <div className="nav-actions">
                    {!user && (
                        <button className="btn-nav-neon nav-desktop-only" onClick={() => { window.location.href = 'zvon://'; }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>
                            Запустить {brand.name}
                        </button>
                    )}
                    <button className="btn-login" onClick={() => navigate('/login')}>
                        {user ? `Открыть ${brand.name}` : 'Войти'}
                    </button>
                </div>
            </nav>

            {/* ===== СЦЕНА 0 — герой (планета в центре) ===== */}
            <section className="scene scene-center" id="hero">
                <div className="scene-copy">
                    <motion.div className="hero-badge" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <span className="dot" /> Новое поколение голосового общения
                    </motion.div>
                    <motion.h1 className="hero-h1 hero-h1-xl" initial="hidden" animate="show" variants={fadeUp}>
                        Место, где звук <br /> становится <span className="grad-text">чувством</span>.
                    </motion.h1>
                    <motion.p className="hero-p" initial="hidden" animate="show" custom={1} variants={fadeUp}>
                        {brand.name} — платформа для общения с кристально чистым звуком, стримингом в 4K и
                        живой 3D-атмосферой. Для геймеров, разработчиков и тех, кто ценит качество.
                    </motion.p>
                    <motion.div className="hero-buttons" initial="hidden" animate="show" custom={2} variants={fadeUp}>
                        <button className="btn-primary-neon" onClick={handleOpenApp}>Запустить в браузере</button>
                        <button className="btn-secondary-outline" onClick={() => { window.location.href = `${import.meta.env.VITE_API_URL || 'https://zvonserver.ru'}/api/download/latest?platform=win`; }}>
                            Скачать для Windows
                        </button>
                    </motion.div>
                </div>
                <div className="scroll-cue" onClick={() => document.getElementById('scene-1')?.scrollIntoView({ behavior: 'smooth' })}>
                    <span /> <span /> <span />
                </div>
            </section>

            {/* ===== СЦЕНА 1 — планета вниз-влево, текст справа ===== */}
            <section className="scene scene-right" id="scene-1">
                <motion.div className="scene-copy" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }}>
                    <div className="eyebrow">Звук</div>
                    <h2 className="scene-h">Голос — как будто рядом</h2>
                    <p className="scene-p">Шумоподавление нового поколения убирает всё лишнее. Кристальная чистота даже в шумной комнате — слышно только тебя.</p>
                </motion.div>
            </section>

            {/* ===== СЦЕНА 2 — планета вниз-вправо, текст слева ===== */}
            <section className="scene scene-left" id="scene-2">
                <motion.div className="scene-copy" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }}>
                    <div className="eyebrow">Сообщество</div>
                    <h2 className="scene-h">Создай свой мир</h2>
                    <p className="scene-p">Серверы, каналы, роли и тонкие права доступа. Организуй пространство так, как удобно именно тебе и твоим людям.</p>
                    <button className="btn-secondary-outline" onClick={() => navigate('/register')}>Создать сервер</button>
                </motion.div>
            </section>

            {/* ===== СЦЕНА 3 — планета вверх-влево, текст внизу-справа ===== */}
            <section className="scene scene-br" id="scene-3">
                <motion.div className="scene-copy" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }}>
                    <div className="eyebrow">Расширения</div>
                    <h2 className="scene-h">Боты и мини-приложения</h2>
                    <p className="scene-p">Музыка, магазин, модерация, игры — прямо внутри. Мощный Bot API на Webhooks и Socket.io для своих интеграций.</p>
                </motion.div>
            </section>

            {/* ===== СЦЕНА 4 — планета в центр, CTA ===== */}
            <section className="scene scene-center" id="scene-4">
                <motion.div className="scene-copy" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }}>
                    <div className="eyebrow">Поехали</div>
                    <h2 className="scene-h">Весь мир на связи</h2>
                    <p className="scene-p">Более 100 000 пользователей уже общаются в {brand.name}. Присоединяйся — это бесплатно.</p>
                    <div className="hero-buttons" style={{ justifyContent: 'center' }}>
                        <button className="btn-primary-neon" onClick={() => navigate('/register')}>Создать аккаунт</button>
                        <button className="btn-secondary-outline" onClick={handleOpenApp}>Открыть в браузере</button>
                    </div>
                </motion.div>
            </section>

            <div className="landing-rest">
            {/* ===== Бегущая строка / статы ===== */}
            <section className="stats-section" id="stats">
                <div className="marquee">
                    <div className="marquee-track">
                        {['КРИСТАЛЬНЫЙ ЗВУК', '4K СТРИМИНГ', 'НИЗКАЯ ЗАДЕРЖКА', '3D-АТМОСФЕРА', 'BOT API', 'ПРИВАТНОСТЬ', 'КРОСС-ПЛАТФОРМА']
                            .concat(['КРИСТАЛЬНЫЙ ЗВУК', '4K СТРИМИНГ', 'НИЗКАЯ ЗАДЕРЖКА', '3D-АТМОСФЕРА', 'BOT API', 'ПРИВАТНОСТЬ', 'КРОСС-ПЛАТФОРМА'])
                            .map((t, i) => <span key={i} className="marquee-item">{t} <i>✦</i></span>)}
                    </div>
                </div>
                <div className="stats-grid">
                    {[['100K+', 'пользователей'], ['4K·60', 'fps стриминг'], ['<40ms', 'задержка'], ['99.9%', 'аптайм']].map(([n, l], i) => (
                        <motion.div key={i} className="stat-pill" variants={fadeUp} custom={i} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.6 }}>
                            <div className="stat-n">{n}</div>
                            <div className="stat-l">{l}</div>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* ===== Возможности (тилт-карточки) ===== */}
            <section className="features-section" id="features">
                <motion.div className="section-head" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}>
                    <div className="eyebrow">Возможности</div>
                    <h2>Всё для идеального общения</h2>
                </motion.div>
                <div className="features-grid">
                    {[
                        { t: 'Кристальный звук', d: 'Шумоподавление нового поколения убирает всё лишнее. Вас слышно идеально даже в шумной обстановке.', svg: <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3" /> },
                        { t: 'Стриминг 4K/60fps', d: 'Делитесь экраном с минимальной задержкой. Захват системного аудио включён по умолчанию.', svg: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8 M12 17v4" /></> },
                        { t: 'Полная приватность', d: 'Ваши звонки и сообщения защищены. Мы ценим вашу конфиденциальность и безопасность данных.', svg: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /> },
                        { t: '3D-атмосфера', d: 'Живые сцены и анимации делают присутствие ощутимым — общение становится событием.', svg: <><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5 M2 12l10 5 10-5" /></> },
                        { t: 'Мощный Bot API', d: 'Webhooks и Socket.io SDK: музыкальные боты, роли, кастомные команды и мини-приложения.', svg: <><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M12 7v4 M8 2v3 M16 2v3" /><circle cx="8.5" cy="16" r="1" /><circle cx="15.5" cy="16" r="1" /></> },
                        { t: 'Кросс-платформа', d: 'Браузер, Windows и десктоп — единый опыт везде, где вы есть.', svg: <><rect x="2" y="4" width="14" height="10" rx="1" /><path d="M18 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-2 M2 18h10" /></> },
                    ].map((f, i) => (
                        <motion.div key={i} className="feature-card tilt" variants={fadeUp} custom={i} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }}>
                            <div className="feature-icon">
                                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{f.svg}</svg>
                            </div>
                            <h3>{f.t}</h3>
                            <p>{f.d}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* ===== Промо-ролик (код-ролик вместо картинки) ===== */}
            <section className="reel-section" id="reel">
                <motion.div className="reel-frame reel-frame-clean" style={{ aspectRatio: '16 / 9' }} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }}>
                    <PromoReel />
                </motion.div>
            </section>

            {/* ===== Демонстрация интерфейса ===== */}
            <section className="showcase-section" id="showcase">
                <div className="showcase-content">
                    <motion.div className="showcase-text" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }}>
                        <div className="eyebrow">Сервера</div>
                        <h2>Создайте свой мир.</h2>
                        <p>
                            Серверы {brand.name} позволяют организовать пространство так, как удобно вам.
                            Создавайте роли, настраивайте права доступа и делайте свой сервер уникальным.
                        </p>
                        <button className="btn-secondary" onClick={() => navigate('/register')}>Присоединиться сейчас</button>
                    </motion.div>
                    <motion.div className="showcase-image tilt" initial={{ opacity: 0, x: 60 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.7, ease: EASE }}>
                        <img src={heroImg} alt={`${brand.name} Interface`} onError={(e) => {
                            e.currentTarget.src = 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=1200';
                        }} />
                    </motion.div>
                </div>
            </section>

            {/* ===== CTA ===== */}
            <section className="cta-section" id="download">
                <motion.div className="cta-card" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }}>
                    <h2>Готовы начать свое общение?</h2>
                    <p>Более 100,000 пользователей уже выбрали {brand.name} как основной инструмент для связи.</p>
                    <button className="btn-login" style={{ padding: '16px 48px', fontSize: '18px' }} onClick={() => navigate('/register')}>
                        Зарегистрироваться
                    </button>
                </motion.div>
            </section>

            <footer id="support">
                <div className="footer-content">
                    <div className="footer-brand">
                        <h4>{brand.name}</h4>
                        <p>© 2026 {brand.name} Platform. Все права защищены.</p>
                        <div className="bot-api-showcase">
                            <h3>Мощный Bot API</h3>
                            <p>Создавайте уникальные интеграции с помощью Webhooks и Socket.io SDK. Музыкальные боты, управление ролями и кастомные команды.</p>
                            <button className="btn-link" onClick={() => navigate('/docs')}>Читать документацию →</button>
                        </div>
                    </div>
                    <div className="footer-links">
                        <div className="footer-column">
                            <h5>Продукт</h5>
                            <ul>
                                <li><a onClick={() => navigate('/security')}>Безопасность</a></li>
                                <li><a onClick={() => window.open('https://github.com/pkda1lu/zvon/commits/main', '_blank')}>Список изменений</a></li>
                                <li><a onClick={() => navigate('/servers')}>Серверы</a></li>
                                <li><a onClick={() => navigate('/docs')}>API для ботов</a></li>
                            </ul>
                        </div>
                        <div className="footer-column">
                            <h5>Компания</h5>
                            <ul>
                                <li><a onClick={() => navigate('/about')}>О нас</a></li>
                                <li><a onClick={() => navigate('/download')}>Загрузить</a></li>
                                <li><a onClick={() => window.open('https://github.com/pkda1lu/zvon', '_blank')}>Github</a></li>
                            </ul>
                        </div>
                        <div className="footer-column">
                            <h5>Ресурсы</h5>
                            <ul>
                                <li><a onClick={() => window.open('https://t.me/zvon_support', '_blank')}>Поддержка</a></li>
                                <li><a onClick={() => navigate('/docs')}>Для разработчиков</a></li>
                                <li><a onClick={() => navigate('/policy')}>Условия использования</a></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </footer>
            </div>

            {/* ===== Модалка с роликом ===== */}
            <AnimatePresence>
                {videoOpen && (
                    <motion.div className="video-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setVideoOpen(false)}>
                        <motion.div className="video-modal" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }} onClick={(e) => e.stopPropagation()}>
                            <button className="video-modal-close" onClick={() => setVideoOpen(false)} aria-label="Закрыть">✕</button>
                            <div className="video-modal-player"><ScreenshotReel slides={SHOTS} /></div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Landing;
