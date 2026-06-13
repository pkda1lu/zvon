import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getIconBrand } from '../utils/branding';

/**
 * Сгенерированный промо-ролик: самопроигрывающаяся последовательность сцен
 * (без видеофайла). Крутится в цикле, поэтому работает в модалке как «видео».
 */
const SCENE_MS = 3600;

const PromoReel: React.FC<{ loop?: boolean }> = ({ loop = true }) => {
    const brand = getIconBrand();
    const [i, setI] = useState(0);

    const scenes = [
        // 0 — заставка
        (
            <div className="pr-scene pr-intro">
                <div className="pr-orb"><span /><span /><span /></div>
                <motion.h2 className="pr-title pr-brand grad-text"
                    initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.7 }}>
                    {brand.name}
                </motion.h2>
                <motion.p className="pr-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
                    Звук, который чувствуешь
                </motion.p>
            </div>
        ),
        // 1 — звук
        (
            <div className="pr-scene">
                <div className="pr-eq">
                    {Array.from({ length: 28 }).map((_, k) => <span key={k} style={{ animationDelay: `${(k % 14) * 0.06}s` }} />)}
                </div>
                <SceneText title="Кристальный звук" sub="Шумоподавление нового поколения — слышно только тебя" />
            </div>
        ),
        // 2 — стриминг
        (
            <div className="pr-scene">
                <div className="pr-window">
                    <div className="pr-window-bar"><i /><i /><i /></div>
                    <div className="pr-window-body"><div className="pr-stream-glow" /><div className="pr-4k">4K · 60FPS</div></div>
                </div>
                <SceneText title="Стриминг без задержек" sub="Делись экраном с системным звуком в один клик" />
            </div>
        ),
        // 3 — серверы
        (
            <div className="pr-scene">
                <div className="pr-server">
                    {['# общий', '# разработка', '🔊 Голосовой', '# мемы', '# музыка'].map((c, k) => (
                        <motion.div key={k} className="pr-channel" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + k * 0.1 }}>{c}</motion.div>
                    ))}
                </div>
                <SceneText title="Создай свой мир" sub="Каналы, роли и права — всё под тебя" />
            </div>
        ),
        // 4 — боты/мини-аппы
        (
            <div className="pr-scene">
                <div className="pr-cards">
                    {[['🎵', 'Музыка'], ['🛡', 'Модерация'], ['🛍', 'Магазин'], ['🎮', 'Игры']].map(([e, t], k) => (
                        <motion.div key={k} className="pr-card" initial={{ opacity: 0, y: 24, rotate: -4 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: 0.1 + k * 0.12 }}>
                            <span className="pr-card-e">{e}</span><span>{t}</span>
                        </motion.div>
                    ))}
                </div>
                <SceneText title="Боты и мини-приложения" sub="Расширяй {b} как захочешь" b={brand.name} />
            </div>
        ),
        // 5 — CTA
        (
            <div className="pr-scene pr-cta">
                <motion.h2 className="pr-title" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                    Присоединяйся к <span className="grad-text">{brand.name}</span>
                </motion.h2>
                <motion.div className="pr-fake-btn" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}>
                    Начать бесплатно
                </motion.div>
            </div>
        ),
    ];

    useEffect(() => {
        const t = setTimeout(() => {
            setI(prev => {
                if (prev + 1 >= scenes.length) return loop ? 0 : prev;
                return prev + 1;
            });
        }, SCENE_MS);
        return () => clearTimeout(t);
    }, [i, scenes.length, loop]);

    return (
        <div className="promo-reel">
            <div className="pr-bg" />
            <AnimatePresence mode="wait">
                <motion.div key={i} className="pr-stage"
                    initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}>
                    {scenes[i]}
                </motion.div>
            </AnimatePresence>
            <div className="pr-progress">
                {scenes.map((_, k) => (
                    <div key={k} className="pr-seg">
                        <motion.span
                            initial={{ width: k < i ? '100%' : '0%' }}
                            animate={{ width: k < i ? '100%' : k === i ? '100%' : '0%' }}
                            transition={k === i ? { duration: SCENE_MS / 1000, ease: 'linear' } : { duration: 0 }}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

const SceneText: React.FC<{ title: string; sub: string; b?: string }> = ({ title, sub, b }) => (
    <div className="pr-text">
        <motion.h2 className="pr-title" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }}>{title}</motion.h2>
        <motion.p className="pr-sub" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}>
            {b ? sub.replace('{b}', b) : sub}
        </motion.p>
    </div>
);

export default PromoReel;
