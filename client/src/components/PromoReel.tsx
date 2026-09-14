import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getIconBrand } from '../utils/branding';
import './PromoReel.css';

/**
 * Промо-ролик в духе продуктовой презентации: самопроигрывающаяся
 * последовательность сцен вместо видеофайла. Крутится в цикле, поэтому
 * одинаково работает и в секции лендинга, и в модалке.
 *
 * Одна мысль на сцену, без технических подробностей — ролик для пользователя,
 * а не для разработчика.
 */

/** Длительность каждой сцены, мс. Индексы совпадают со scenes ниже. */
const DURATIONS = [6200, 6600, 7000, 6400, 7200, 6800, 7000, 7600];

const HashIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" />
        <line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
    </svg>
);

const SpeakerGlyph = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
);

const CubeGlyph = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8l-9-5-9 5v8l9 5 9-5z" /><path d="M3.3 7.3 12 12l8.7-4.7" /><path d="M12 12v9" />
    </svg>
);

const MicMutedGlyph = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="3" y1="3" x2="21" y2="21" /><path d="M9 9v3a3 3 0 0 0 5.1 2.1" />
        <path d="M12 2a3 3 0 0 1 3 3v6" /><path d="M19 10v2a7 7 0 0 1-.9 3.4" />
        <path d="M5 10v2a7 7 0 0 0 11 5.7" /><line x1="12" y1="19" x2="12" y2="22" />
    </svg>
);

const PromoReel: React.FC<{ loop?: boolean }> = ({ loop = true }) => {
    const brand = getIconBrand();
    const base = import.meta.env.BASE_URL;
    const [i, setI] = useState(0);

    /* Полоски эквалайзера: центральная — голос, остальные — шум вокруг. */
    const bars = useMemo(() => Array.from({ length: 33 }, (_, k) => k), []);

    const scenes: React.ReactNode[] = [
        // 0 — заставка
        (
            <>
                <span className="pr-logo"><img src={`${base}${brand.favicon}`} alt={brand.name} /></span>
                <h2 className="pr-h1 pr-grad pr-r pr-r2">{brand.name}</h2>
                <p className="pr-sub pr-r pr-r3">Звук, который чувствуешь.</p>
            </>
        ),
        // 1 — чистый голос
        (
            <>
                <div className="pr-eq" aria-hidden="true">
                    {bars.map(k => (
                        <span
                            key={k}
                            className={k === 16 ? 'pr-lead' : undefined}
                            style={{ animationDelay: `${(k % 11) * 0.05}s, 1.6s` }}
                        />
                    ))}
                </div>
                <h2 className="pr-h2 pr-r">Тишина в комплекте.</h2>
                <p className="pr-sub pr-r pr-r2">Никакого шума вокруг. Друзья слышат <b>только твой голос</b>.</p>
            </>
        ),
        // 2 — демонстрация экрана
        (
            <>
                <div className="pr-win" aria-hidden="true">
                    <div className="pr-winbar"><i /><i /><i /></div>
                    <div className="pr-winbody">
                        <span className="pr-chip">Показ экрана</span>
                        <span className="pr-chip">Со звуком<span className="pr-dots"><i /><i /><i /></span></span>
                    </div>
                </div>
                <h2 className="pr-h2 pr-r">Покажи, что у тебя на экране.</h2>
                <p className="pr-sub pr-r pr-r2">Игра, фильм или работа — вместе со звуком, как будто вы в одной комнате.</p>
            </>
        ),
        // 3 — интерфейс
        (
            <>
                <div className="pr-glass" aria-hidden="true">
                    <div className="pr-pane pr-pane-a" /><div className="pr-pane pr-pane-b" />
                </div>
                <h2 className="pr-h2 pr-r">Красиво до мелочей.</h2>
                <p className="pr-sub pr-r pr-r2">Живое стекло, мягкий свет и плавные переходы. Приятно каждый день.</p>
            </>
        ),
        // 4 — сервер, каналы и голосовые (повторяет вид сайдбара приложения)
        (
            <>
                <div className="pr-app" aria-hidden="true">
                    <div className="pr-rail"><i className="pr-cur" /><i /><i /><i /></div>
                    <div className="pr-list">
                        <div className="pr-cat">Текстовые каналы</div>
                        <div className="pr-ch"><HashIcon /><span className="pr-nm">общий</span></div>
                        <div className="pr-ch"><HashIcon /><span className="pr-nm">разработка</span></div>
                        <div className="pr-cat">Голосовые каналы</div>
                        <div className="pr-ch pr-active">
                            <span className="pr-dot"><b /></span>
                            <span className="pr-nm">Общение</span>
                            <span className="pr-timer">41:07</span>
                        </div>
                        <div className="pr-vusers">
                            <div className="pr-vu pr-speaking"><span className="pr-av">А</span><span className="pr-nm">anton</span></div>
                            <div className="pr-vu"><span className="pr-av">М</span><span className="pr-nm">mira</span><span className="pr-air">ЭФИР</span></div>
                            <div className="pr-vu"><span className="pr-av">К</span><span className="pr-nm">kir</span><span className="pr-mute"><MicMutedGlyph /></span></div>
                        </div>
                        <div className="pr-ch"><SpeakerGlyph /><span className="pr-nm">Катка</span></div>
                        <div className="pr-cat">3D-каналы</div>
                        <div className="pr-ch"><CubeGlyph /><span className="pr-nm">Лаунж</span></div>
                    </div>
                </div>
                <h2 className="pr-h2 pr-r">Твой мир. Твои правила.</h2>
                <p className="pr-sub pr-r pr-r2">Каналы для разговоров, для игр и для своих. Кто куда заходит — решаешь ты.</p>
            </>
        ),
        // 5 — мини-приложения
        (
            <>
                <div className="pr-floats" aria-hidden="true">
                    <div className="pr-float pr-f1"><div className="pr-bar"><i /><i /></div><div className="pr-face">🎮</div></div>
                    <div className="pr-float pr-f2"><div className="pr-bar"><i /><i /></div><div className="pr-face">🛍</div></div>
                    <div className="pr-float pr-f3"><div className="pr-bar"><i /><i /></div><div className="pr-face">🎵</div></div>
                </div>
                <h2 className="pr-h2 pr-r">Приложения внутри разговора.</h2>
                <p className="pr-sub pr-r pr-r2">Игры, музыка и магазин — в отдельном окне, не выходя из разговора.</p>
            </>
        ),
        // 6 — Vlyne ID
        (
            <>
                <div className="pr-idwrap" aria-hidden="true">
                    <span className="pr-ring pr-ring-a" /><span className="pr-ring pr-ring-b" /><span className="pr-ring pr-ring-c" />
                    <div className="pr-idcore"><img src={`${base}iconVlyneID-192.png`} alt="Vlyne ID" /></div>
                </div>
                <h2 className="pr-h2 pr-r">Vlyne ID.</h2>
                <p className="pr-sub pr-r pr-r2">Один аккаунт на всё: {brand.name}, приложение и бот в Telegram.</p>
                <div className="pr-sats pr-r pr-r3">
                    <span className="pr-sat">{brand.name}</span>
                    <span className="pr-sat">Vlyne Client</span>
                    <span className="pr-sat">Telegram-бот</span>
                </div>
            </>
        ),
        // 7 — финал
        (
            <>
                <span className="pr-logo pr-logo-sm"><img src={`${base}${brand.favicon}`} alt={brand.name} /></span>
                <h2 className="pr-h1 pr-grad pr-r pr-r2">{brand.name}</h2>
                <div className="pr-cta pr-r pr-r3">Скачать для Windows</div>
                <p className="pr-domain pr-r pr-r4">{brand.domain}</p>
            </>
        ),
    ];

    useEffect(() => {
        const t = setTimeout(() => {
            setI(prev => {
                if (prev + 1 >= scenes.length) return loop ? 0 : prev;
                return prev + 1;
            });
        }, DURATIONS[i] ?? 6500);
        return () => clearTimeout(t);
    }, [i, scenes.length, loop]);

    return (
        <div className="promo-reel">
            <div className="pr-vignette" />
            <AnimatePresence mode="wait">
                <motion.div
                    key={i}
                    className={`pr-scene${i === 4 ? ' pr-compact' : ''}`}
                    initial={{ opacity: 0, scale: 1.015 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.99 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                    {scenes[i]}
                </motion.div>
            </AnimatePresence>
            <div className="pr-progress">
                {scenes.map((_, k) => (
                    <div key={k} className="pr-seg">
                        <motion.span
                            initial={{ width: k < i ? '100%' : '0%' }}
                            animate={{ width: k <= i ? '100%' : '0%' }}
                            transition={k === i ? { duration: (DURATIONS[k] ?? 6500) / 1000, ease: 'linear' } : { duration: 0 }}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PromoReel;
