import React, { useEffect, useRef, useState } from 'react';
import { useAppearance } from '../contexts/AppearanceContext';
import './LiminalBackdrop.css';

/*
 * Фон «человек за матовым стеклом»: пустой голосовой канал и идущий звонок.
 *
 * Съёмка светлая (белое стекло), интерфейс тёмный — кадр инвертируется в
 * CSS: светлая фигура и ладони проступают из тёмного тумана. Поверх — дымка,
 * виньетка и зерно, чтобы плитки и кнопки читались.
 *
 * Кадр растянут на всю площадь (cover): в широком окне видны лицо и
 * ладони крупным планом.
 *
 * Повтор без рывка: два видео по очереди, за секунду до конца второе
 * начинается с начала и плавно подменяет первое.
 *
 * Видео играет, только пока фон виден и вкладка активна. «Живой фон»
 * выключен или включено «Уменьшение движения» — остаётся неподвижный кадр;
 * в режиме производительности фона нет совсем (см. CSS).
 *
 * Видео: Ron Lach, Pexels (pexels.com/video/8259633), лицензия Pexels.
 */
const SRC = `${import.meta.env.BASE_URL}media/liminal-hands.mp4`;
const CROSSFADE_S = 1;

const LiminalBackdrop: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const { liveBackground, reduceMotion, performanceMode } = useAppearance();
  const rootRef = useRef<HTMLDivElement>(null);
  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);
  const [front, setFront] = useState<'a' | 'b'>('a');
  const frontRef = useRef(front);
  frontRef.current = front;

  const animated = active && liveBackground && !reduceMotion && !performanceMode;
  // Видео (2,9 МБ) грузится, только когда фон впервые понадобился.
  const [armed, setArmed] = useState(active && !performanceMode);
  useEffect(() => { if (active && !performanceMode) setArmed(true); }, [active, performanceMode]);

  // Играть, только когда фон на экране и вкладка видна.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let onScreen = true;
    const sync = () => {
      const current = frontRef.current === 'a' ? aRef.current : bRef.current;
      const other = frontRef.current === 'a' ? bRef.current : aRef.current;
      if (!current) return;
      if (animated && onScreen && !document.hidden) current.play().catch(() => {});
      else { current.pause(); other?.pause(); }
    };
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); });
    io.observe(root);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, [animated, front, armed]);

  const onTime = (which: 'a' | 'b') => (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (which !== frontRef.current || !v.duration || v.currentTime < v.duration - CROSSFADE_S) return;
    const next = which === 'a' ? bRef.current : aRef.current;
    if (!next) return;
    next.currentTime = 0;
    next.play().catch(() => {});
    setFront(which === 'a' ? 'b' : 'a');
    window.setTimeout(() => { if (frontRef.current !== which) v.pause(); }, CROSSFADE_S * 1000);
  };

  return (
    <div ref={rootRef} className={`liminal-backdrop${active ? ' is-active' : ''}`} aria-hidden="true">
      {armed && <div className="liminal-backdrop__film">
        <video ref={aRef} src={SRC} muted playsInline preload="auto" disablePictureInPicture
          className={front === 'a' ? 'is-front' : ''} onTimeUpdate={onTime('a')} />
        <video ref={bRef} src={SRC} muted playsInline preload="auto" disablePictureInPicture
          className={front === 'b' ? 'is-front' : ''} onTimeUpdate={onTime('b')} />
      </div>}
      <div className="liminal-backdrop__haze" />
      <div className="liminal-backdrop__grain" />
    </div>
  );
};

export default LiminalBackdrop;
