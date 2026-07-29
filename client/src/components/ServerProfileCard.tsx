import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Server } from '../types';
import { getAvatarUrl, getFullUrl } from '../utils/avatar';
import { useDialog } from '../contexts/DialogContext';
import UserBadges, { resolveServerTag } from './UserBadges';
import { motion } from 'framer-motion';
import {
  popoverVariants,
  popoverTransition,
  modalPopVariants,
  modalPopTransition,
} from '../animations/transitions';
import './UserProfileCard.css';
import './ServerProfileCard.css';

interface ServerProfileCardOverrides {
    name?: string;
    description?: string;
    icon?: string | null;
    banner?: string | null;
    bannerColor?: string;
    features?: string[];
    featuredActivities?: { name: string; image?: string | null }[];
}

interface ServerProfileCardBodyProps {
    server: Server;
    overrides?: ServerProfileCardOverrides;
    onOwnerClick?: (userId: string, event?: React.MouseEvent) => void;
    onLeave?: () => void;
}

/**
 * Содержимое компактной карточки сервера — переиспользуется и в попапе (клик по серверу),
 * и в предпросмотре настроек "Профиль сервера" (там же, но с ещё не сохранёнными правками).
 */
export const ServerProfileCardBody: React.FC<ServerProfileCardBodyProps> = ({ server, overrides, onOwnerClick, onLeave }) => {
    const name = overrides?.name ?? server.name;
    const description = overrides?.description ?? server.description;
    const icon = overrides && 'icon' in overrides ? overrides.icon : server.icon;
    const banner = overrides && 'banner' in overrides ? overrides.banner : server.banner;
    const bannerColor = overrides?.bannerColor ?? server.bannerColor ?? '#5865f2';
    const features = (overrides?.features ?? server.features ?? []).filter(f => f && f.trim());
    const featuredActivities = overrides?.featuredActivities ?? server.featuredActivities ?? [];
    const owner = typeof server.owner === 'object' ? (server.owner as any) : null;

    return (
        <div className="compact-profile-wrapper">
            <div
                className="profile-banner"
                style={{
                    backgroundColor: bannerColor,
                    backgroundImage: banner ? `url(${getFullUrl(banner)})` : 'none',
                    backgroundSize: 'cover',
                    height: '120px'
                }}
            />

            <div className="profile-header">
                <div className="profile-avatar-container">
                    <div className="profile-avatar" style={{ width: '80px', height: '80px', background: '#202225', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px', fontWeight: 800, color: '#fff', overflow: 'hidden' }}>
                        {icon ? <img src={getAvatarUrl(icon)!} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>{name ? name.charAt(0).toUpperCase() : '?'}</span>}
                    </div>
                </div>
            </div>

            <div className="profile-body server-profile-body-spacing">
                <div className="profile-names">
                    <div className="profile-names-top">
                        <span className="profile-nickname">{name || 'Название сервера'}</span>
                    </div>
                </div>

                <div className="profile-divider"></div>

                <div className="info-tab">
                    {description && (
                        <section>
                            <h4>О СЕРВЕРЕ</h4>
                            <p className="bio-text">{description}</p>
                        </section>
                    )}

                    {features.length > 0 && (
                        <section>
                            <h4>ФИШКИ</h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {features.map((f, i) => (
                                    <span key={i} className="server-settings-role-tag">{f}</span>
                                ))}
                            </div>
                        </section>
                    )}

                    {featuredActivities.length > 0 && (
                        <section>
                            <h4>ЛЮБИМЫЕ АКТИВНОСТИ</h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                {featuredActivities.map((a, i) => (
                                    <div key={`${a.name}-${i}`} title={a.name} style={{ width: '36px', height: '36px', borderRadius: '10px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)' }}>
                                        {a.image ? (
                                            <img src={getFullUrl(a.image)!} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <span style={{ fontSize: '14px', fontWeight: 800 }}>{a.name.charAt(0).toUpperCase()}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <section>
                        <h4>СТАТИСТИКА</h4>
                        <div className="server-profile-stats">
                            <div className="stat-item">
                                <span className="stat-value">{server.members.length}</span>
                                <span className="stat-label">Участников</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">
                                    {new Date(server.createdAt).toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })}
                                </span>
                                <span className="stat-label">Создан</span>
                            </div>
                        </div>
                    </section>

                    {owner && (
                        <section>
                            <h4>ВЛАДЕЛЕЦ</h4>
                            <div
                                className="mutual-item server-profile-owner"
                                onClick={(e) => onOwnerClick?.(owner._id, e)}
                                style={{ cursor: onOwnerClick ? 'pointer' : 'default' }}
                            >
                                <div className="mutual-avatar">
                                    {getAvatarUrl(owner.avatar) ? <img src={getAvatarUrl(owner.avatar)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>{owner.username?.charAt(0).toUpperCase()}</span>}
                                </div>
                                <span>{owner.username}</span>
                                <UserBadges badges={owner.badges} serverTag={resolveServerTag(owner)} size={14} />
                            </div>
                        </section>
                    )}
                </div>

                {onLeave && (
                    <div className="server-profile-actions">
                        <button className="leave-server-btn" onClick={onLeave}>
                            Покинуть сервер
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

interface ServerProfileCardProps {
    server: Server;
    onClose: () => void;
    onLeave: (serverId: string) => void;
    position?: { x: number, y: number } | null;
    onUserClick?: (userId: string, event?: React.MouseEvent) => void;
}

import { useAppearance } from '../contexts/AppearanceContext';

// ... (imports)

const ServerProfileCard: React.FC<ServerProfileCardProps> = ({ server, onClose, onLeave, position, onUserClick }) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const { confirm, alert } = useDialog();
    const { interfaceScale } = useAppearance();
    const [adjustedPos, setAdjustedPos] = useState({ top: position?.y || 0, left: (position?.x || 0) + 20 });
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (!position || !cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        let finalX = position.x + 20;
        let finalY = position.y;

        if (finalX + rect.width > window.innerWidth) {
            finalX = position.x - rect.width - 20;
        }

        if (finalY + rect.height > window.innerHeight) {
            finalY = position.y - rect.height;
        }

        if (finalY + rect.height > window.innerHeight) finalY = window.innerHeight - rect.height - 10;
        if (finalY < 10) finalY = 10;
        if (finalX < 10) finalX = 10;
        if (finalX + rect.width > window.innerWidth) finalX = window.innerWidth - rect.width - 10;

        setAdjustedPos({ top: finalY, left: finalX });
        setIsVisible(true);
    }, [position, interfaceScale]);

    const handleLeave = async () => {
        if (await confirm(`Вы уверены, что хотите покинуть сервер "${server.name}"?`)) {
            try {
                await axios.post(`/api/servers/${server._id}/leave`);
                onLeave(server._id);
                onClose();
            } catch (err) {
                await alert('Не удалось покинуть сервер');
            }
        }
    };

    return (
        <div className={`user-profile-overlay ${position ? 'transparent' : ''}`} onClick={onClose}>
            <motion.div
                className={`user-profile-card ${position ? 'popout' : ''} panel-hero`}
                onClick={e => e.stopPropagation()}
                style={position ? {
                    position: 'absolute',
                    top: adjustedPos.top,
                    left: adjustedPos.left,
                    visibility: isVisible ? 'visible' : 'hidden',
                } : undefined}
                ref={cardRef}
                variants={position ? popoverVariants : modalPopVariants}
                initial="initial"
                animate={position ? (isVisible ? 'animate' : 'initial') : 'animate'}
                transition={position ? popoverTransition : modalPopTransition}
            >
                <div style={{ transform: `scale(${interfaceScale})`, transformOrigin: position ? 'top left' : 'center' }}>
                    <div className="panel-hero-bg" aria-hidden="true">
                        <div className="blob cyan" />
                        <div className="blob purple" />
                        <div className="blob pink" />
                    </div>
                    <ServerProfileCardBody server={server} onOwnerClick={onUserClick} onLeave={handleLeave} />
                </div>
            </motion.div>
        </div>
    );
};

export default ServerProfileCard;
