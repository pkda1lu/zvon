import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Channel, DirectMessage, Server, User } from '../types';
import { isGroupDM } from '../utils/dm';
import { getFullUrl } from '../utils/avatar';
import { computePermissions, hasPermission, Permissions } from '../utils/permissions';
import { useDraftChatIds } from '../utils/drafts';
import { HashtagIcon, SearchIcon, UsersIcon } from './Icons';
import UserAvatar from './UserAvatar';
import './QuickSwitcher.css';

/*
 * Быстрый переход по Ctrl+K: каналы, личные переписки, друзья и серверы в
 * одном поиске. Префиксы сужают выдачу: # — каналы, @ — люди, * — серверы.
 */

type Target =
  | { kind: 'channel'; key: string; label: string; sub: string; server: Server; channel: Channel }
  | { kind: 'dm'; key: string; label: string; sub: string; dm: DirectMessage; avatarUser: User | null }
  | { kind: 'friend'; key: string; label: string; sub: string; user: User }
  | { kind: 'server'; key: string; label: string; sub: string; server: Server };

interface QuickSwitcherProps {
  servers: Server[];
  dms: DirectMessage[];
  friends: User[];
  currentUser: User;
  unreadCounts: Record<string, number>;
  onSelectChannel: (server: Server, channel: Channel) => void;
  onSelectDM: (dm: DirectMessage) => void;
  onStartDM: (userId: string) => void;
  onSelectServer: (server: Server) => void;
}

const MAX_RESULTS = 40;

// Чем раньше и плотнее совпадение, тем выше: начало названия, начало слова,
// подстрока, затем буквы по порядку («прм» → «пр-и-м-еры»).
const score = (text: string, q: string): number => {
  const t = text.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - t.length;
  const wordIdx = t.search(new RegExp(`[\\s_\\-.]${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  if (wordIdx !== -1) return 600 - wordIdx;
  const idx = t.indexOf(q);
  if (idx !== -1) return 400 - idx;
  let pos = 0;
  for (const ch of q) {
    pos = t.indexOf(ch, pos);
    if (pos === -1) return -1;
    pos++;
  }
  return 100 - (pos - q.length);
};

const QuickSwitcher: React.FC<QuickSwitcherProps> = ({
  servers, dms, friends, currentUser, unreadCounts,
  onSelectChannel, onSelectDM, onStartDM, onSelectServer,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const draftIds = useDraftChatIds();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.code === 'KeyK' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setOpen(prev => {
          if (!prev) restoreFocusRef.current = document.activeElement as HTMLElement | null;
          return !prev;
        });
      }
    };
    const onOpenEvent = () => {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('zvon-open-quick-switcher', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('zvon-open-quick-switcher', onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const close = () => {
    setOpen(false);
    restoreFocusRef.current?.focus?.();
  };

  const targets = useMemo<Target[]>(() => {
    if (!open) return [];
    const list: Target[] = [];
    const dmUserIds = new Set<string>();

    dms.forEach(dm => {
      const others = dm.participants.filter(p => p._id !== currentUser._id);
      const isGroup = isGroupDM(dm);
      if (!isGroup && others[0]) dmUserIds.add(others[0]._id);
      const label = dm.name
        || (isGroup ? others.map(p => p.displayName || p.username).join(', ') : (others[0]?.displayName || others[0]?.username))
        || 'Чат';
      list.push({
        kind: 'dm', key: `dm-${dm._id}`, label,
        sub: isGroup ? `Группа · ${dm.participants.length} участников` : (others[0] ? `@${others[0].username}` : 'Личные сообщения'),
        dm, avatarUser: isGroup ? null : others[0] || null,
      });
    });

    friends.forEach(f => {
      if (dmUserIds.has(f._id)) return;
      list.push({ kind: 'friend', key: `friend-${f._id}`, label: f.displayName || f.username, sub: `@${f.username} · друг`, user: f });
    });

    servers.forEach(server => {
      list.push({ kind: 'server', key: `server-${server._id}`, label: server.name, sub: 'Сервер', server });
      (server.channels || []).forEach(ch => {
        if (ch.type !== 'text' && ch.type !== 'room') return;
        if (!hasPermission(computePermissions(currentUser._id, server, ch), Permissions.VIEW_CHANNEL)) return;
        list.push({ kind: 'channel', key: `ch-${ch._id}`, label: ch.name, sub: server.name, server, channel: ch });
      });
    });
    return list;
  }, [open, dms, friends, servers, currentUser._id]);

  const chatIdOf = (t: Target) => t.kind === 'channel' ? t.channel._id : t.kind === 'dm' ? t.dm._id : null;

  const results = useMemo(() => {
    let q = query.trim().toLowerCase();
    let kinds: Target['kind'][] | null = null;
    if (q.startsWith('#')) { kinds = ['channel']; q = q.slice(1); }
    else if (q.startsWith('@')) { kinds = ['dm', 'friend']; q = q.slice(1); }
    else if (q.startsWith('*')) { kinds = ['server']; q = q.slice(1); }
    const pool = kinds ? targets.filter(t => kinds!.includes(t.kind)) : targets;

    if (!q) {
      // Без запроса — то, куда скорее всего хотят: чаты с непрочитанным и
      // черновиками, затем недавние переписки.
      if (kinds) return pool.slice(0, MAX_RESULTS);
      const weight = (t: Target) => {
        const id = chatIdOf(t);
        if (!id) return 0;
        return (unreadCounts[id] ? 2 : 0) + (draftIds.has(id) ? 1 : 0);
      };
      const hot = pool.filter(t => weight(t) > 0).sort((a, b) => weight(b) - weight(a));
      const recentDms = pool.filter(t => t.kind === 'dm' && weight(t) === 0).slice(0, 8);
      return [...hot, ...recentDms].slice(0, MAX_RESULTS);
    }

    return pool
      .map(t => {
        const s = Math.max(score(t.label, q), t.kind === 'channel' || t.kind === 'friend' || t.kind === 'dm' ? score(t.sub, q) - 300 : -1);
        const id = chatIdOf(t);
        return { t, s: s < 0 ? s : s + (id && unreadCounts[id] ? 20 : 0) };
      })
      .filter(x => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_RESULTS)
      .map(x => x.t);
  }, [targets, query, unreadCounts, draftIds]);

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (t: Target | undefined) => {
    if (!t) return;
    setOpen(false);
    if (t.kind === 'channel') onSelectChannel(t.server, t.channel);
    else if (t.kind === 'dm') onSelectDM(t.dm);
    else if (t.kind === 'friend') onStartDM(t.user._id);
    else onSelectServer(t.server);
  };

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') e.preventDefault();
  };

  const renderIcon = (t: Target) => {
    if (t.kind === 'channel') return <div className="qs-icon qs-icon--hash"><HashtagIcon size={18} /></div>;
    if (t.kind === 'server') {
      const icon = t.server.icon ? getFullUrl(t.server.icon) : null;
      return icon
        ? <img className="qs-icon qs-icon--server" src={icon} alt="" />
        : <div className="qs-icon qs-icon--server">{t.server.name.slice(0, 2).toUpperCase()}</div>;
    }
    if (t.kind === 'dm' && !t.avatarUser) return <div className="qs-icon qs-icon--group"><UsersIcon size={18} /></div>;
    const u = t.kind === 'dm' ? t.avatarUser! : t.user;
    return <UserAvatar user={u} size={32} className="qs-icon" />;
  };

  return createPortal(
    <div className="qs-overlay zv-dialog-overlay" onMouseDown={close}>
      <div
        className="qs-dialog zv-dialog-surface"
        role="dialog"
        aria-modal="true"
        aria-label="Быстрый переход"
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="qs-search">
          <SearchIcon size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Куда перейти?"
            aria-label="Куда перейти"
            role="combobox"
            aria-expanded="true"
            aria-controls="qs-results"
            aria-activedescendant={results[active] ? `qs-${results[active].key}` : undefined}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="qs-kbd">Esc</kbd>
        </div>

        <div className="qs-results custom-scrollbar" id="qs-results" role="listbox" ref={listRef}>
          {results.length === 0 ? (
            <div className="qs-empty">
              {query.trim() ? 'Ничего не найдено' : 'Начните вводить название канала, сервера или имя'}
            </div>
          ) : results.map((t, i) => {
            const id = chatIdOf(t);
            const unread = id ? unreadCounts[id] || 0 : 0;
            return (
              <div
                key={t.key}
                id={`qs-${t.key}`}
                data-index={i}
                role="option"
                aria-selected={i === active}
                className={`qs-item ${i === active ? 'active' : ''}`}
                onMouseMove={() => { if (i !== active) setActive(i); }}
                onClick={() => choose(t)}
              >
                {renderIcon(t)}
                <div className="qs-item__text">
                  <span className="qs-item__label">{t.label}</span>
                  <span className="qs-item__sub">{t.sub}</span>
                </div>
                {id && draftIds.has(id) && <span className="qs-item__draft" title="Есть черновик">✎</span>}
                {unread > 0 && <span className="qs-item__badge">{unread > 99 ? '99+' : unread}</span>}
              </div>
            );
          })}
        </div>

        <div className="qs-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> выбрать</span>
          <span><kbd>Enter</kbd> перейти</span>
          <span className="qs-footer__hints"><b>#</b> каналы · <b>@</b> люди · <b>*</b> серверы</span>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default QuickSwitcher;
