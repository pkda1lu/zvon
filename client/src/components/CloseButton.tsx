import React, { useEffect } from 'react';
import { CloseIcon } from './Icons';
import './CloseButton.css';

// Capture Escape before the legacy modal and application shortcut listeners.
// Click exactly one visible control so nested windows close one at a time.
function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button.zv-close'));
  const visible = buttons.filter(button => {
    if (button.disabled) return false;
    const rect = button.getBoundingClientRect();
    if (!rect.width || !rect.height || getComputedStyle(button).visibility === 'hidden') return false;
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 25);
    return !!hit && button.contains(hit);
  });
  const stack = (element: HTMLElement) => {
    const levels: number[] = [];
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const z = getComputedStyle(node).zIndex;
      if (z !== 'auto') levels.unshift(Number(z) || 0);
    }
    return levels;
  };
  visible.sort((a, b) => {
    const left = stack(a), right = stack(b);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const difference = (left[i] || 0) - (right[i] || 0);
      if (difference) return difference;
    }
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
  const top = visible[visible.length - 1];
  if (!top) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!event.repeat) top.click();
}

let mountedControls = 0;

/** Shared close control, matching the attachments viewer. */
const CloseButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = '', ...props }) => {
  useEffect(() => {
    if (mountedControls++ === 0) window.addEventListener('keydown', handleEscape, true);
    return () => {
      if (--mountedControls === 0) window.removeEventListener('keydown', handleEscape, true);
    };
  }, []);
  return (
  <button type="button" aria-label="Закрыть" title="Закрыть (ESC)" {...props} className={`zv-close ${className}`}>
    <span className="zv-close__circle"><CloseIcon size={20} /></span>
    <span className="zv-close__label" aria-hidden="true">ESC</span>
  </button>
  );
};

export default CloseButton;
