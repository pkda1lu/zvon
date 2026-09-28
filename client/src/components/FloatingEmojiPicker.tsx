import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import EmojiPicker from './EmojiPicker';
import { Server } from '../types';

/*
 * Выбор эмодзи для реакции, поверх всего интерфейса.
 *
 * Раньше в четырёх местах (меню сообщения и панель при наведении — в каналах
 * и в личке) стоял один и тот же код: окно ставилось левым верхним углом в
 * точку клика и «прижималось» к краю по заранее заданным 340×420. Размер
 * окна не мерили, якорем была точка курсора, а не кнопка — и окно то
 * налезало на меню, то уезжало в угол экрана.
 *
 * Теперь окно встаёт под кнопкой-якорем (или над ней, если снизу не
 * помещается), выравнивается по её краю и не выходит за экран; размер
 * берётся фактический.
 */

export interface EmojiAnchor {
    x: number;
    y: number;
    /** Прямоугольник кнопки, из которой открыли выбор. */
    rect?: { left: number; top: number; right: number; bottom: number };
}

interface Props {
    anchor: EmojiAnchor;
    server?: Server;
    onSelect: (emoji: string) => void;
    onClose: () => void;
}

const MARGIN = 8;
const GAP = 6;

const FloatingEmojiPicker: React.FC<Props> = ({ anchor, server, onSelect, onClose }) => {
    const boxRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ left: number; top: number; origin: string } | null>(null);

    useLayoutEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const w = el.offsetWidth, h = el.offsetHeight;
        const vw = window.innerWidth, vh = window.innerHeight;
        const r = anchor.rect || { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };

        // По вертикали: под якорем, иначе над ним, иначе — сколько влезет.
        let top = r.bottom + GAP;
        let vertical = 'top';
        if (top + h > vh - MARGIN && r.top - GAP - h >= MARGIN) { top = r.top - GAP - h; vertical = 'bottom'; }
        top = Math.max(MARGIN, Math.min(top, vh - h - MARGIN));

        // По горизонтали: от левого края якоря, у правого края экрана — от правого.
        let left = r.left;
        let horizontal = 'left';
        if (left + w > vw - MARGIN) { left = r.right - w; horizontal = 'right'; }
        left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));

        setPos({ left, top, origin: `${vertical} ${horizontal}` });
    }, [anchor]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    return createPortal(
        <div className="floating-emoji-backdrop" onMouseDown={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }}>
            <div
                ref={boxRef}
                className="floating-emoji-box"
                style={pos ? { left: pos.left, top: pos.top, visibility: 'visible' } : { left: 0, top: 0, visibility: 'hidden' }}
                onMouseDown={e => e.stopPropagation()}
            >
                <EmojiPicker server={server} onSelect={onSelect} transformOrigin={pos?.origin} />
            </div>
        </div>,
        document.body
    );
};

export default FloatingEmojiPicker;
