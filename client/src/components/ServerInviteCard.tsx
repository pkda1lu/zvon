import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getAvatarUrl } from '../utils/avatar';
import { openInviteInApp } from '../utils/inviteLinks';
import './ServerInviteCard.css';

interface ServerInviteCardProps {
    code: string;
}

interface InvitePreview {
    code: string;
    server: { _id: string; name: string; icon?: string; description?: string; memberCount: number };
    inviter?: { username: string };
}

// Карточка приглашения на сервер, встраиваемая в сообщение.
// Подтягивает превью сервера по коду и даёт кнопку «Присоединиться»,
// которая открывает модалку-приглашение внутри приложения.
const ServerInviteCard: React.FC<ServerInviteCardProps> = ({ code }) => {
    const [invite, setInvite] = useState<InvitePreview | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        setLoading(true); setError('');
        axios.get(`/api/invites/${code}`)
            .then(res => { if (active) setInvite(res.data); })
            .catch((err: any) => { if (active) setError(err.response?.data?.message || 'Приглашение недействительно'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [code]);

    if (loading) {
        return (
            <div className="server-invite-card server-invite-card--loading" onClick={e => e.stopPropagation()}>
                <span className="server-invite-card__label">Загрузка приглашения…</span>
            </div>
        );
    }

    if (error || !invite) {
        return (
            <div className="server-invite-card server-invite-card--error" onClick={e => e.stopPropagation()}>
                <span className="server-invite-card__label">{error || 'Приглашение недействительно'}</span>
            </div>
        );
    }

    const iconUrl = getAvatarUrl(invite.server.icon);

    return (
        <div className="server-invite-card" onClick={e => e.stopPropagation()}>
            <div className="server-invite-card__label">Приглашение на сервер</div>
            <div className="server-invite-card__body">
                <div className="server-invite-card__icon">
                    {iconUrl ? (
                        <img src={iconUrl} alt="" />
                    ) : (
                        <span>{invite.server.name.charAt(0).toUpperCase()}</span>
                    )}
                </div>
                <div className="server-invite-card__info">
                    <div className="server-invite-card__name">{invite.server.name}</div>
                    <div className="server-invite-card__meta">
                        <span className="server-invite-card__dot" />
                        {invite.server.memberCount} участников
                    </div>
                </div>
                <button
                    className="server-invite-card__join"
                    onClick={(e) => { e.stopPropagation(); openInviteInApp(invite.code); }}
                >
                    Присоединиться
                </button>
            </div>
        </div>
    );
};

export default ServerInviteCard;
