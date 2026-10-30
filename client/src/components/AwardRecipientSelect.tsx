import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Check, ChevronDown, Search, Users } from 'lucide-react';
import UserAvatar from './UserAvatar';

export interface AwardRecipient { _id: string; username: string; displayName?: string; avatar?: string }
const AwardRecipientSelect: React.FC<{ value: AwardRecipient | null; onChange: (user: AwardRecipient | null) => void; disabled: boolean }> = ({ value, onChange, disabled }) => {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const restoringFocus = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AwardRecipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const up = below < 220 && above > below;
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)), width: Math.min(rect.width, window.innerWidth - 16), ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }), maxHeight: Math.min(300, Math.max(100, up ? above : below)) });
    };
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!input.current?.parentElement?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError(false); setUsers([]); setActive(-1);
    const timer = window.setTimeout(() => {
      axios.get('/api/awards/recipients', { params: { q: query }, signal: controller.signal }).then(({ data }) => {
        if (!Array.isArray(data)) throw new Error('Invalid recipients');
        if (!controller.signal.aborted) { setUsers(data); setActive(data.length ? 0 : -1); }
      }).catch(() => { if (!controller.signal.aborted) setError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [open, query, retry]);
  useEffect(() => { popup.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const choose = (user: AwardRecipient) => {
    onChange(user); setQuery(''); setOpen(false);
    if (document.activeElement !== input.current) { restoringFocus.current = true; input.current?.focus(); }
  };
  return <div className="award-recipient">
    <label htmlFor={id}>Получатель награды</label>
    <div className="award-recipient__control">
      {value ? <UserAvatar user={value} size={28} /> : <Search size={18} />}
      <input id={id} ref={input} role="combobox" aria-label="Поиск получателя награды" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined} disabled={disabled} autoComplete="off" maxLength={80}
        placeholder="Найти по нику или имени" value={open ? query : value ? `${value.displayName || value.username} · @${value.username}` : ''}
        onFocus={() => { if (restoringFocus.current) { restoringFocus.current = false; return; } setQuery(''); setOpen(true); }}
        onChange={event => { onChange(null); setQuery(event.target.value); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          if (event.key === 'Tab') setOpen(false);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(previous => users.length ? (previous + (event.key === 'ArrowDown' ? 1 : -1) + users.length) % users.length : -1); }
          if (event.key === 'Enter' && open) { event.preventDefault(); if (users[active]) choose(users[active]); }
        }} />
      <button type="button" aria-label="Показать пользователей" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => { if (open) setOpen(false); else { setQuery(''); setOpen(true); input.current?.focus(); } }}><ChevronDown size={18} /></button>
    </div>
    {value && <small>Выбран @{value.username}</small>}
    {open && position && createPortal(<div ref={popup} className="award-recipient-popup" style={position}>
      <div className="award-recipient-popup__caption"><Users size={14} />{query ? 'Результаты поиска' : 'Пользователи'}<span>до 20 результатов</span></div>
      <div role="listbox" id={`${id}-list`} aria-label="Получатели награды" aria-busy={loading}>
        {loading ? <p role="status">Ищем пользователей…</p> : error ? <div className="award-recipient-popup__status" role="alert"><p>Не удалось загрузить пользователей.</p><button type="button" onClick={() => setRetry(v => v + 1)}>Повторить</button></div> : !users.length ? <p role="status">Никого не нашли. Попробуйте другой ник или имя.</p> : users.map((user, index) => <div role="option" id={`${id}-option-${index}`} aria-selected={active === index} key={user._id} className="award-recipient-popup__option" onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(user)}>
          <UserAvatar user={user} size={34} /><span><strong>{user.displayName || user.username}</strong><small>@{user.username}</small></span>{value?._id === user._id && <Check size={16} />}
        </div>)}
      </div>
    </div>, document.body)}
  </div>;
};
export default AwardRecipientSelect;
