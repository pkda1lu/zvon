import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { popoverVariants, popoverTransition } from '../animations/transitions';
import { PlusIcon } from './Icons';
import './ComposerAddMenu.css';

interface ComposerAddMenuProps {
  onAttach: () => void;
  onGif: (pos: { x: number; y: number }) => void;
  onPoll: () => void;
}

const PollGlyph: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="20" x2="6" y2="12" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="18" y1="20" x2="18" y2="14" />
  </svg>
);

const ComposerAddMenu: React.FC<ComposerAddMenuProps> = ({ onAttach, onGif, onPoll }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const run = (fn: () => void) => { setOpen(false); fn(); };

  const handleGif = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    const pos = rect ? { x: rect.left, y: rect.top - 400 } : { x: 20, y: 20 };
    run(() => onGif(pos));
  };

  return (
    <div className="composer-add" ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className={`attachment-button${open ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Добавить"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <PlusIcon />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="composer-add-menu"
            variants={popoverVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={popoverTransition}
            style={{ transformOrigin: 'bottom left' }}
          >
            <button type="button" className="composer-add-item" onClick={() => run(onAttach)}>
              <span className="composer-add-icon"><PlusIcon /></span>
              <span>Прикрепить медиа</span>
            </button>
            <button type="button" className="composer-add-item" onClick={handleGif}>
              <span className="composer-add-icon composer-add-gif">GIF</span>
              <span>GIF</span>
            </button>
            <button type="button" className="composer-add-item" onClick={() => run(onPoll)}>
              <span className="composer-add-icon"><PollGlyph /></span>
              <span>Опрос</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ComposerAddMenu;
