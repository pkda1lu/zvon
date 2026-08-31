import { useRef, useCallback, useMemo } from 'react';

/**
 * Вызов контекстного меню долгим нажатием — для сенсорных экранов.
 *
 * В браузере на телефоне правого щелчка нет, а собственное меню системы
 * (копировать / поделиться) к нашим действиям отношения не имеет. Поэтому
 * меню открывается удержанием, как принято в мобильных приложениях.
 *
 * Что здесь важно и неочевидно:
 *
 *  — Прокрутка. Списки чатов и участников листают тем же пальцем, поэтому при
 *    смещении больше нескольких пикселей удержание отменяется. Без этого меню
 *    выскакивало бы посреди прокрутки.
 *
 *  — Щелчок после удержания. Отпуская палец, браузер шлёт обычный click, и
 *    строка открывалась бы вместе с меню. Гасим его один раз на фазе
 *    перехвата.
 *
 *  — Своё меню системы. На iOS удержание запускает выделение текста и всплывающую
 *    панель. Отключается только оформлением (-webkit-touch-callout), поэтому
 *    хук отдаёт ещё и className.
 *
 *  — Мышь не трогаем: правый щелчок продолжает работать своим обработчиком,
 *    хук вешается рядом.
 */

interface LongPressOptions {
    /** Сколько держать, миллисекунды. */
    delay?: number;
    /** Допустимое смещение пальца, пиксели. Больше — считаем прокруткой. */
    moveTolerance?: number;
}

export interface LongPressHandlers {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
    onClickCapture: (e: React.MouseEvent) => void;
    className: string;
}

export function useLongPress(
    onLongPress: (position: { x: number; y: number }) => void,
    { delay = 450, moveTolerance = 10 }: LongPressOptions = {}
): LongPressHandlers {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startRef = useRef<{ x: number; y: number } | null>(null);
    const firedRef = useRef(false);

    const cancel = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        startRef.current = null;
    }, []);

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        // Несколько пальцев — это жест масштабирования, не удержание.
        if (e.touches.length !== 1) { cancel(); return; }
        const t = e.touches[0];
        startRef.current = { x: t.clientX, y: t.clientY };
        firedRef.current = false;

        timerRef.current = setTimeout(() => {
            const start = startRef.current;
            if (!start) return;
            firedRef.current = true;
            timerRef.current = null;
            // Короткая отдача, если устройство умеет: без неё непонятно, что
            // удержание засчитано, и палец убирают раньше времени.
            try { navigator.vibrate?.(15); } catch { /* необязательно */ }
            onLongPress({ x: start.x, y: start.y });
        }, delay);
    }, [cancel, delay, onLongPress]);

    const onTouchMove = useCallback((e: React.TouchEvent) => {
        const start = startRef.current;
        if (!start || !timerRef.current) return;
        const t = e.touches[0];
        if (!t) return;
        const dx = Math.abs(t.clientX - start.x);
        const dy = Math.abs(t.clientY - start.y);
        if (dx > moveTolerance || dy > moveTolerance) cancel();
    }, [cancel, moveTolerance]);

    const onTouchEnd = useCallback(() => { cancel(); }, [cancel]);

    const onClickCapture = useCallback((e: React.MouseEvent) => {
        if (!firedRef.current) return;
        // Меню уже открыто удержанием — сопутствующий щелчок не нужен.
        firedRef.current = false;
        e.preventDefault();
        e.stopPropagation();
    }, []);

    return useMemo(() => ({
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        onTouchCancel: onTouchEnd,
        onClickCapture,
        className: 'long-pressable',
    }), [onTouchStart, onTouchMove, onTouchEnd, onClickCapture]);
}
