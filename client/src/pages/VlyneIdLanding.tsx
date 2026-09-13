import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import VlyneIdNav from '../components/VlyneIdNav';
import VibeBackground from '../components/VibeBackground';
import './VlyneIdLanding.css';

/**
 * Главная страница Vlyne ID — для обычного человека, а не для разработчика.
 *
 * Сюда попадают, нажав «Подробнее» на экране входа или в настройках аккаунта.
 * Это значит, что у читателя нет ни вопроса про PKCE, ни желания разбираться в
 * потоках авторизации: ему надо понять, что случилось с его аккаунтом и что
 * теперь можно делать. Поэтому здесь нет ни одного эндпоинта и ни одной строки
 * кода — всё техническое вынесено на отдельную страницу /vlyneid/developers,
 * ссылка на неё есть, но она не бросается в глаза.
 *
 * Оформление намеренно повторяет лендинг Zvon: неоновый градиент, крупная
 * типографика, стеклянные карточки. Vlyne ID должен читаться как часть той же
 * экосистемы, а не как служебная страница сбоку.
 */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const fadeUp = {
    hidden: { opacity: 0, y: 34 },
    show: (i = 0) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, delay: i * 0.08, ease: EASE }
    })
};

const BENEFITS = [
    {
        title: 'Один аккаунт вместо нескольких',
        text: 'Аккаунт, с которым вы заходите в Zvon, работает и в остальных проектах Vlyne. Регистрироваться заново нигде не нужно.',
        icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>
    },
    {
        title: 'Вход в одно нажатие',
        text: 'Никаких новых паролей и писем с подтверждением. Открываете сервис, нажимаете «Войти через Vlyne ID» — и вы внутри.',
        icon: <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></>
    },
    {
        title: 'Видно, где вы вошли',
        text: 'Список устройств и приложений — в личном кабинете. Заметили чужой вход — завершаете его сами, не дожидаясь поддержки.',
        icon: <><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>
    },
    {
        title: 'Доступ отзывается сразу',
        text: 'Передумали давать приложению доступ — одна кнопка, и он обрывается немедленно, даже если приложение уже вошло.',
        icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9.5 11.5l1.8 1.8 3.4-3.6" /></>
    },
    {
        title: 'Пароль остаётся у нас',
        text: 'Сервисы получают только разрешение действовать от вашего имени. Ваш пароль они не видят и не хранят.',
        icon: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>
    },
    {
        title: 'Вы выбираете, чем делиться',
        text: 'Перед входом видно, что именно просит сервис: имя, почту или что-то ещё. Не согласны — не пускаете.',
        icon: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" /></>
    }
];

const STEPS = [
    {
        n: '1',
        title: 'Открываете сервис Vlyne',
        text: 'И нажимаете «Войти через Vlyne ID» — обычную кнопку входа, как в любом другом приложении.'
    },
    {
        n: '2',
        title: 'Видите, что он просит',
        text: 'Появляется короткий список: имя, аватар, почта. Ровно то, что нужно сервису, и ничего сверх.'
    },
    {
        n: '3',
        title: 'Нажимаете «Разрешить»',
        text: 'Один раз. В следующие входы экран уже не появится — вы попадёте внутрь сразу.'
    }
];

const FAQ = [
    {
        q: 'Мне нужно что-то делать прямо сейчас?',
        a: 'Нет. Ваш аккаунт уже является Vlyne ID — ничего включать, подтверждать или переносить не требуется. Логин и пароль остались теми же.'
    },
    {
        q: 'Это безопасно?',
        a: 'Пароль не передаётся сервисам ни при каком раскладе: они получают только временное разрешение действовать от вашего имени, и вы в любой момент можете его отозвать. Все входы и выданные доступы видны в личном кабинете, так что чужую активность вы заметите сами.'
    },
    {
        q: 'А если я не хочу давать доступ какому-то сервису?',
        a: 'Просто не нажимайте «Разрешить» — без вашего согласия он не получит ничего. Уже выданный доступ отключается в личном кабинете одной кнопкой.'
    },
    {
        q: 'Что будет с моими данными в Zvon?',
        a: 'Ничего не меняется. Vlyne ID — это способ входить в другие проекты тем же аккаунтом, а не новое хранилище. Всё, что о вас хранится, можно выгрузить одним файлом в разделе «Мои данные».'
    },
    {
        q: 'Я могу удалить Vlyne ID?',
        a: 'Vlyne ID — это и есть ваш аккаунт, поэтому его удаление равно удалению аккаунта. Это делается в настройках Zvon, где показаны последствия целиком.'
    }
];

const VlyneIdLanding: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [openFaq, setOpenFaq] = useState<number | null>(0);

    const isSubdomain = /^vlyneid\./i.test(window.location.hostname);
    const accountPath = isSubdomain ? '/account' : '/vlyneid/account';
    const devPath = isSubdomain ? '/developers' : '/vlyneid/developers';

    const scrollTo = (id: string) =>
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    return (
        <div className="vidl">
            <VibeBackground />

            <div className="vidl-content">
                {/* Одно действие, а не два: и «Войти», и «Личный кабинет» вели
                    в одно и то же место. Подпись зависит от того, вошёл ли
                    человек — вошедшему предлагать войти незачем. */}
                <VlyneIdNav actions={[
                    { label: user ? 'Личный кабинет' : 'Войти', to: accountPath, primary: true }
                ]} />

                {/* ===== Первый экран ===== */}
                <section className="vidl-hero">
                    <motion.div
                        className="vidl-hero-inner"
                        initial="hidden"
                        animate="show"
                        variants={fadeUp}
                    >
                        <motion.div className="vidl-badge" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                            <span className="vidl-badge-dot" /> Единый аккаунт экосистемы Vlyne
                        </motion.div>

                        <motion.h1 className="vidl-h1" variants={fadeUp} custom={1}>
                            Один аккаунт<br />на <span className="vidl-grad">всё сразу</span>
                        </motion.h1>

                        <motion.p className="vidl-hero-text" variants={fadeUp} custom={2}>
                            Vlyne ID — это ваш аккаунт Zvon, которым можно входить во все проекты Vlyne.
                            Новых паролей не нужно, а где вы вошли и кому дали доступ — всегда видно и
                            всегда можно отменить.
                        </motion.p>

                        <motion.div className="vidl-hero-actions" variants={fadeUp} custom={3}>
                            <button className="vidl-btn vidl-btn-primary" onClick={() => navigate(accountPath)}>
                                {user ? 'Открыть личный кабинет' : 'Войти в личный кабинет'}
                            </button>
                            <button className="vidl-btn vidl-btn-ghost" onClick={() => scrollTo('how')}>
                                Как это работает
                            </button>
                        </motion.div>
                    </motion.div>

                    <button className="vidl-cue" onClick={() => scrollTo('why')} aria-label="Дальше">
                        <span /><span /><span />
                    </button>
                </section>

                {/* ===== Что это даёт ===== */}
                <section className="vidl-section" id="why">
                    <motion.div className="vidl-head" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}>
                        <div className="vidl-eyebrow">Что это даёт</div>
                        <h2>Меньше паролей — больше контроля</h2>
                        <p>Вход перестаёт быть отдельной задачей в каждом сервисе, а управление доступом наконец собирается в одном месте.</p>
                    </motion.div>

                    <div className="vidl-cards">
                        {BENEFITS.map((b, i) => (
                            <motion.div
                                key={b.title}
                                className="vidl-card"
                                variants={fadeUp}
                                custom={i}
                                initial="hidden"
                                whileInView="show"
                                viewport={{ once: true, amount: 0.3 }}
                            >
                                <div className="vidl-card-icon">
                                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        {b.icon}
                                    </svg>
                                </div>
                                <h3>{b.title}</h3>
                                <p>{b.text}</p>
                            </motion.div>
                        ))}
                    </div>
                </section>

                {/* ===== Как это работает ===== */}
                <section className="vidl-section" id="how">
                    <motion.div className="vidl-head" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}>
                        <div className="vidl-eyebrow">Как это работает</div>
                        <h2>Три шага, и только один раз</h2>
                        <p>Дальше вход происходит сам собой — экран согласия больше не появится.</p>
                    </motion.div>

                    <div className="vidl-steps">
                        {STEPS.map((s, i) => (
                            <motion.div
                                key={s.n}
                                className="vidl-step"
                                variants={fadeUp}
                                custom={i}
                                initial="hidden"
                                whileInView="show"
                                viewport={{ once: true, amount: 0.4 }}
                            >
                                <div className="vidl-step-n">{s.n}</div>
                                <h3>{s.title}</h3>
                                <p>{s.text}</p>
                            </motion.div>
                        ))}
                    </div>
                </section>

                {/* ===== Личный кабинет ===== */}
                <section className="vidl-section" id="account">
                    <motion.div
                        className="vidl-panel"
                        variants={fadeUp}
                        initial="hidden"
                        whileInView="show"
                        viewport={{ once: true, amount: 0.3 }}
                    >
                        <div className="vidl-panel-text">
                            <div className="vidl-eyebrow">Личный кабинет</div>
                            <h2>Видно всё, что происходит с аккаунтом</h2>
                            <p>
                                Кабинет отвечает на один вопрос: кто и откуда пользуется вашим аккаунтом.
                                Если увидите вход, которого не совершали, — завершите его сами, не дожидаясь,
                                пока что-то случится.
                            </p>
                            <ul className="vidl-list">
                                <li>История входов и действий</li>
                                <li>Устройства, на которых выполнен вход</li>
                                <li>Приложения с доступом — и кнопка отключить</li>
                                <li>Выгрузка всех ваших данных одним файлом</li>
                            </ul>
                            <button className="vidl-btn vidl-btn-primary" onClick={() => navigate(accountPath)}>
                                Открыть кабинет
                            </button>
                        </div>

                        {/* Схематичное окно кабинета: показать интерфейс честнее, чем
                            описывать его словами, а снимок экрана устареет к первому
                            же изменению вёрстки. */}
                        <div className="vidl-mock" aria-hidden="true">
                            <div className="vidl-mock-bar"><span /><span /><span /></div>
                            <div className="vidl-mock-tabs">
                                <span className="active">Обзор</span><span>Активность</span><span>Устройства</span><span>Приложения</span>
                            </div>
                            <div className="vidl-mock-row">
                                <div className="vidl-mock-dot ok" />
                                <div className="vidl-mock-lines"><i style={{ width: '52%' }} /><i style={{ width: '76%' }} /></div>
                                <div className="vidl-mock-tag">это устройство</div>
                            </div>
                            <div className="vidl-mock-row">
                                <div className="vidl-mock-dot" />
                                <div className="vidl-mock-lines"><i style={{ width: '40%' }} /><i style={{ width: '64%' }} /></div>
                                <div className="vidl-mock-btn">Завершить</div>
                            </div>
                            <div className="vidl-mock-row">
                                <div className="vidl-mock-dot" />
                                <div className="vidl-mock-lines"><i style={{ width: '46%' }} /><i style={{ width: '58%' }} /></div>
                                <div className="vidl-mock-btn">Отключить</div>
                            </div>
                        </div>
                    </motion.div>
                </section>

                {/* ===== Вопросы ===== */}
                <section className="vidl-section" id="faq">
                    <motion.div className="vidl-head" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}>
                        <div className="vidl-eyebrow">Частые вопросы</div>
                        <h2>Коротко о главном</h2>
                    </motion.div>

                    <div className="vidl-faq">
                        {FAQ.map((item, i) => (
                            <div className={`vidl-faq-item ${openFaq === i ? 'open' : ''}`} key={item.q}>
                                <button
                                    className="vidl-faq-q"
                                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                    aria-expanded={openFaq === i}
                                >
                                    <span>{item.q}</span>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                </button>
                                {openFaq === i && <div className="vidl-faq-a">{item.a}</div>}
                            </div>
                        ))}
                    </div>
                </section>

                {/* ===== Призыв ===== */}
                <section className="vidl-section vidl-section-cta">
                    <motion.div className="vidl-cta" variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }}>
                        <h2>Ваш Vlyne ID уже готов</h2>
                        <p>Он создан вместе с аккаунтом Zvon. Загляните в кабинет и посмотрите, что о вас известно.</p>
                        <button className="vidl-btn vidl-btn-primary" onClick={() => navigate(accountPath)}>
                            Перейти в личный кабинет
                        </button>
                    </motion.div>
                </section>

                <footer className="vidl-footer">
                    <div>© 2026 Vlyne ID — единый вход экосистемы Vlyne</div>
                    <div className="vidl-footer-links">
                        <a href="https://zvonserver.ru">Zvon</a>
                        <a href="https://zvonserver.ru/policy">Конфиденциальность</a>
                        <a href="mailto:support@zvonserver.ru">Поддержка</a>
                        {/* Разработчикам — сюда, чтобы техническая часть не пугала
                            остальных на первом же экране. */}
                        <button className="vidl-footer-btn" onClick={() => navigate(devPath)}>Разработчикам</button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default VlyneIdLanding;
