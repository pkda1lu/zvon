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
  user?: { displayedTag?: { type?: string; server?: any } | null } | null,
  ownServers?: any[] | null
): { text?: string | null; icon?: string | null; color?: string } | undefined => {
  const dt = user?.displayedTag;
  if (!dt || dt.type !== 'serverTag' || !dt.server) return undefined;
  let srv = dt.server;
  if (typeof srv === 'string') {
    srv = ownServers?.find(s => String(s._id) === srv);
  }
  return srv?.tag?.text ? srv.tag : undefined;
};

interface UserBadgesProps {
  badges?: string[];
  /** Значок сервера (заранее разрешённый вызывающим компонентом), показывается вместо профильных значков. */
  serverTag?: { text?: string | null; icon?: string | null; color?: string } | null;
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
