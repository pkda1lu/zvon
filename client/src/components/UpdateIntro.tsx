import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useFreezeAppBackground } from '../animations/useFreezeAppBackground';
import { markUpdateIntroShown } from '../utils/updateIntro';
import './UpdateIntro.css';

/*
 * Ролик «Zvon 3.0» — один раз, при первом запуске настольного клиента 3.0.
 *
 * Показываем только в приложении (есть IPC) и только на версии 3.0.x: из того
 * же кода собирается переходный Electron 2.9.x, и в нём ролика быть не должно,
 * как и в веб-версии. Отметка о показе ставится сразу при открытии — если
 * приложение закроют посреди ролика, второй раз он не появится.
 */

const INTRO_SRC = `${import.meta.env.BASE_URL}intro/zvon-3.0.mp4`;

const UpdateIntro: React.FC<{ onDone: () => void }> = ({ onDone }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [open, setOpen] = useState(true);
    const [needsTap, setNeedsTap] = useState(false);
    const [canSkip, setCanSkip] = useState(false);

    useFreezeAppBackground(open);

    useEffect(() => { markUpdateIntroShown(); }, []);

    const close = useCallback(() => {
        videoRef.current?.pause();
        setOpen(false);
    }, []);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        // Со звуком. Если окно не разрешит автозапуск со звуком — играем без
        // звука и предлагаем включить его.
        v.play().catch(() => {
            v.muted = true;
            setNeedsTap(true);
            v.play().catch(() => { /* ролик не запустился — дадим закрыть окно */ setCanSkip(true); });
        });
        const t = setTimeout(() => setCanSkip(true), 1500);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        window.addEventListener('keydown', onKey);
        return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
    }, [close]);

    return createPortal(
        <AnimatePresence onExitComplete={onDone}>
            {open && (
                <motion.div
                    className="update-intro"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.35 } }}
                    transition={{ duration: 0.4 }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Что нового в Zvon 3.0"
                >
                    <motion.div
                        className="update-intro-frame"
                        initial={{ scale: 0.94, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.97, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                    >
                        <video
                            ref={videoRef}
                            className="update-intro-video"
                            src={INTRO_SRC}
                            playsInline
                            preload="auto"
                            onEnded={close}
                            onError={close}
                        />
                        {needsTap && (
                            <button
                                className="zv-btn zv-btn--primary update-intro-sound"
                                onClick={() => { const v = videoRef.current; if (v) { v.muted = false; v.play().catch(() => { }); } setNeedsTap(false); }}
                            >
                                Включить звук
                            </button>
                        )}
                    </motion.div>
                    <AnimatePresence>
                        {canSkip && (
                            <motion.button
                                className="zv-btn zv-btn--ghost update-intro-skip"
                                onClick={close}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                            >
                                Пропустить
                            </motion.button>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default UpdateIntro;
