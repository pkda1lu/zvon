import React from 'react';
import './UserBadges.css';
import { getAvatarUrl } from '../utils/avatar';
import { AVAILABLE_BADGES } from '../data/badges';

export interface Badge {
  id: string;
  label: string;
  icon: string;
}

// Единая база значков (../data/badges) — здесь только меняем форму на Record для быстрого поиска по id.
export const BADGES: Record<string, Badge> = Object.fromEntries(
  AVAILABLE_BADGES.map(b => [b.id, { id: b.id, label: b.label, icon: b.image }])
);

/**
 * Резолвит выбранный пользователем значок сервера в отображаемые данные {text, icon, color}.
 * `displayedTag.server` может быть как populated-объектом (уже содержит tag), так и голым id —
 * во втором случае (например, для своего профиля из AuthContext) ищем сервер в переданном списке.
 */
export const resolveServerTag = (
  user?: { displayedTag?: { type?: string; server?: any; award?: any } | null } | null,
  ownServers?: any[] | null
): { text?: string | null; icon?: string | null; color?: string; award?: { name: string; model: string; color: string } } | undefined => {
  const dt = user?.displayedTag;
  if (dt?.type === 'award' && dt.award?.id) return { award: dt.award };
  if (!dt || dt.type !== 'serverTag' || !dt.server) return undefined;
  let srv = dt.server;
  if (typeof srv === 'string') {
    srv = ownServers?.find(s => String(s._id) === srv);
  }
  return srv?.tag?.text ? srv.tag : undefined;
};

export const AwardBadge: React.FC<{ award: { name: string; model: string; color: string }; size?: number }> = ({ award, size = 18 }) => {
 const paths: Record<string, string> = {
 star: 'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
 crystal: 'M8 2h8l5 7-9 13L3 9z M3 9h18 M8 2l4 20 4-20',
 trophy: 'M7 3h10v7a5 5 0 01-10 0z M7 5H3v3a5 5 0 005 5 M17 5h4v3a5 5 0 01-5 5 M12 15v5 M7 21h10',
 medal: 'M6 2l6 9 6-9 M9 2l3 5 3-5 M18 16a6 6 0 11-12 0 6 6 0 0112 0z',
 bell: 'M5 17h14l-2-4V8a5 5 0 00-10 0v5z M10 21h4',
 rose: 'M12 22V11 M12 17l6-4 M12 19l-6-4 M12 3c5-5 11 3 5 7-3 3-7 3-10 0C1 6 7-2 12 3z'
 };
 return <svg role="img" aria-label={award.name} width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0, color: award.color }}><title>{award.name}</title><path d={paths[award.model] || paths.medal} fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>;
};
interface UserBadgesProps {
  badges?: string[];
  /** Значок сервера (заранее разрешённый вызывающим компонентом), показывается вместо профильных значков. */
  serverTag?: { text?: string | null; icon?: string | null; color?: string; award?: { name: string; model: string; color: string } } | null;
  size?: number;
  className?: string;
}

// hex (#rrggbb) → "r, g, b" для использования в rgba(). Нечитаемый формат — оставляем как есть.
const hexToRgbTriplet = (hex: string): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '88, 101, 242';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};

const UserBadges: React.FC<UserBadgesProps> = ({ badges, serverTag, size = 16, className = "" }) => {
  if (serverTag?.award) return <AwardBadge award={serverTag.award} size={size} />;
  if (serverTag?.text) {
    const color = serverTag.color || '#5865f2';
    const rgb = hexToRgbTriplet(color);
    return (
      <div
        className={`server-tag-preview ${className}`}
        style={{
          background: `rgba(${rgb}, 0.12)`,
          border: `1px solid ${color}`,
          color,
          fontSize: `${Math.max(size * 0.7, 9)}px`,
          padding: `1px ${size * 0.4}px 1px 2px`
        }}
        title={serverTag.text}
      >
        {serverTag.icon && <img src={getAvatarUrl(serverTag.icon)!} alt="" style={{ width: `${size}px`, height: `${size}px` }} />}
        <span>{serverTag.text.slice(0, 5)}</span>
      </div>
    );
  }

  if (!badges || badges.length === 0) return null;

  return (
    <div className={`user-badges-container ${className}`}>
      {badges.map(badgeId => {
        const badge = BADGES[badgeId];
        if (!badge) return null;
        return (
          <img 
            key={badgeId} 
            src={badge.icon}
            alt={badge.label}
            className="user-badge" 
            title={badge.label}
            style={{ width: `${size}px`, height: `${size}px`, objectFit: 'contain' }}
          />
        );
      })}
    </div>
  );
};

export default UserBadges;
