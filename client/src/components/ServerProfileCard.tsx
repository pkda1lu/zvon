import React from 'react';
import { Server } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { CloseIcon } from './Icons';
import './ServerProfileCard.css';

interface ServerProfileCardProps {
    server: Server;
    onClose: () => void;
}

const ServerProfileCard: React.FC<ServerProfileCardProps> = ({ server, onClose }) => {
    return (
        <div className="server-profile-overlay" onClick={onClose}>
            <div className="server-profile-card" onClick={e => e.stopPropagation()}>
                <div
                    className="server-profile-banner"
                    style={{
                        backgroundColor: server.bannerColor || '#5865f2',
                        backgroundImage: server.banner ? `url(${getAvatarUrl(server.banner)})` : 'none'
                    }}
                >
                    <button className="server-profile-close" onClick={onClose}>
                        <CloseIcon />
                    </button>
                </div>

                <div className="server-profile-header">
                    <div className="server-profile-icon-container">
                        <div className="server-profile-icon">
                            {server.icon ? (
                                <img src={getAvatarUrl(server.icon)!} alt={server.name} />
                            ) : (
                                <span>{server.name.charAt(0).toUpperCase()}</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="server-profile-body">
                    <span className="server-profile-name">{server.name}</span>

                    <div className="server-profile-divider"></div>

                    <div className="server-profile-section">
                        <h4>О ПАБЛИКЕ</h4>
                        <p>{server.description || 'Описание отсутствует.'}</p>
                    </div>

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

                    <div className="server-profile-divider"></div>

                    <div className="server-profile-section">
                        <h4>ВЛАДЕЛЕЦ</h4>
                        <div className="owner-info">
                            {typeof server.owner === 'object' && (
                                <>
                                    <img
                                        src={getAvatarUrl((server.owner as any).avatar) || ''}
                                        alt=""
                                        className="owner-avatar"
                                    />
                                    <span style={{ fontSize: '14px', color: '#fff' }}>
                                        {(server.owner as any).username}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ServerProfileCard;
