import { useRef, useCallback, useMemo } from 'react';

export interface MessageGestureOptions {
  /** Delay before long press fires in ms (default: 420ms) */
  longPressDelay?: number;
  /** Distance in px before gesture is considered a scroll and cancelled (default: 10px) */
  moveTolerance?: number;
  /** Whether double-tap detection is enabled */
  doubleTapEnabled?: boolean;
  /** Max delay between taps for double-tap detection in ms (default: 320ms) */
  doubleTapDelay?: number;
  /** Callback on long-press */
  onLongPress?: (position: { x: number; y: number }) => void;
  /** Callback on double-tap */
  onDoubleTap?: (position: { x: number; y: number }) => void;
  /** Whether haptic feedback is allowed */
  hapticFeedback?: boolean;
}

export interface MessageGestureHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchCancel: (e: React.TouchEvent) => void;
  onClickCapture: (e: React.MouseEvent) => void;
  className: string;
}

export function useMessageGestures({
  longPressDelay = 420,
  moveTolerance = 10,
  doubleTapEnabled = true,
  doubleTapDelay = 320,
  onLongPress,
  onDoubleTap,
  hapticFeedback = true,
}: MessageGestureOptions): MessageGestureHandlers {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const longPressFiredRef = useRef(false);
  const lastTapRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const doubleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Only track single touch
    if (e.touches.length !== 1) {
      cancelLongPress();
      startPosRef.current = null;
      return;
    }

    const t = e.touches[0];
    startPosRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
    longPressFiredRef.current = false;

    cancelLongPress();

    if (onLongPress) {
      longPressTimerRef.current = setTimeout(() => {
        const start = startPosRef.current;
        if (!start) return;
        longPressFiredRef.current = true;
        longPressTimerRef.current = null;

        if (hapticFeedback && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          try { navigator.vibrate(20); } catch (_) {}
        }

        onLongPress({ x: start.x, y: start.y });
      }, longPressDelay);
    }
  }, [cancelLongPress, onLongPress, longPressDelay, hapticFeedback]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const start = startPosRef.current;
    if (!start) return;
    const t = e.touches[0];
    if (!t) return;

    const dx = Math.abs(t.clientX - start.x);
    const dy = Math.abs(t.clientY - start.y);

    if (dx > moveTolerance || dy > moveTolerance) {
      cancelLongPress();
      startPosRef.current = null;
      // Movement also invalidates double-tap
      lastTapRef.current = null;
      if (doubleTapTimerRef.current) {
        clearTimeout(doubleTapTimerRef.current);
        doubleTapTimerRef.current = null;
      }
    }
  }, [cancelLongPress, moveTolerance]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    cancelLongPress();

    // If long press fired, suppress this release completely so it doesn't click into the opened menu
    if (longPressFiredRef.current) {
      lastTapRef.current = null;
      startPosRef.current = null;
      longPressFiredRef.current = false;
      try {
        if (e.cancelable) e.preventDefault();
      } catch (_) {}
      e.stopPropagation();

      const stopGhost = (ev: Event) => {
        ev.stopPropagation();
        try {
          if (ev.cancelable) ev.preventDefault();
        } catch (_) {}
      };

      window.addEventListener('click', stopGhost, { capture: true, once: true });
      window.addEventListener('mouseup', stopGhost, { capture: true, once: true });
      window.addEventListener('touchend', stopGhost, { capture: true, once: true });
      window.addEventListener('pointerup', stopGhost, { capture: true, once: true });

      setTimeout(() => {
        window.removeEventListener('click', stopGhost, { capture: true } as any);
        window.removeEventListener('mouseup', stopGhost, { capture: true } as any);
        window.removeEventListener('touchend', stopGhost, { capture: true } as any);
        window.removeEventListener('pointerup', stopGhost, { capture: true } as any);
      }, 400);

      return;
    }

    const start = startPosRef.current;
    startPosRef.current = null;

    if (!start) return;

    const change = e.changedTouches[0];
    const endX = change ? change.clientX : start.x;
    const endY = change ? change.clientY : start.y;
    const now = Date.now();

    // Check for double tap
    if (doubleTapEnabled && onDoubleTap) {
      const prev = lastTapRef.current;
      if (prev && (now - prev.time <= doubleTapDelay)) {
        const dist = Math.hypot(endX - prev.x, endY - prev.y);
        if (dist <= 25) {
          // Double-tap detected!
          lastTapRef.current = null;
          if (doubleTapTimerRef.current) {
            clearTimeout(doubleTapTimerRef.current);
            doubleTapTimerRef.current = null;
          }

          if (hapticFeedback && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try { navigator.vibrate(15); } catch (_) {}
          }

          onDoubleTap({ x: endX, y: endY });
          return;
        }
      }

      // First tap: remember for doubleTapDelay
      lastTapRef.current = { x: endX, y: endY, time: now };
      if (doubleTapTimerRef.current) {
        clearTimeout(doubleTapTimerRef.current);
      }
      doubleTapTimerRef.current = setTimeout(() => {
        lastTapRef.current = null;
        doubleTapTimerRef.current = null;
      }, doubleTapDelay);
    }
  }, [cancelLongPress, doubleTapEnabled, onDoubleTap, doubleTapDelay, hapticFeedback]);

  const onTouchCancel = useCallback(() => {
    cancelLongPress();
    startPosRef.current = null;
    lastTapRef.current = null;
    if (doubleTapTimerRef.current) {
      clearTimeout(doubleTapTimerRef.current);
      doubleTapTimerRef.current = null;
    }
  }, [cancelLongPress]);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return useMemo(() => ({
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    onClickCapture,
    className: 'long-pressable',
  }), [onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onClickCapture]);
}
