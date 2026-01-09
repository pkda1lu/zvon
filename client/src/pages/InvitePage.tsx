import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './InvitePage.css';

const InvitePage: React.FC = () => {
    const { code } = useParams<{ code: string }>();
    const navigate = useNavigate();
    const [invite, setInvite] = useState<any>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);

    useEffect(() => { fetchInvite(); }, [code]);

    const fetchInvite = async () => {
        try {
            const response = await axios.get(`/api/invites/${code}`);
            setInvite(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Приглашение недействительно');
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        setJoining(true);
        try {
            await axios.post(`/api/invites/${code}/join`);
            navigate('/');
        } catch (err: any) {
            if (err.response?.data?.message === 'Already a member') navigate('/');
            else setError(err.response?.data?.message || 'Не удалось присоединиться');
        } finally {
            setJoining(false);
        }
    };

    useEffect(() => {
        if (invite && (window as any).electron && !joining && !error) handleJoin();
    }, [invite, joining, error]);

    if (loading) return <div className="invite-page-loading">Загрузка...</div>;

    const isElectron = (window as any).electron;

    return (
        <div className="invite-page-container">
            <div className="invite-card">
                {error ? (
                    <div className="invite-error">
                        <div className="invite-icon-error">✕</div>
                        <h3>Ошибка приглашения</h3>
                        <p>{error}</p>
                        <button onClick={() => navigate('/')}>Перейти в Zvon</button>
                    </div>
                ) : (
                    <>
                        {invite.server.icon ? (
                            <img src={invite.server.icon} alt="" className="server-icon-large" />
                        ) : (
                            <div className="server-icon-placeholder">{invite.server.name.charAt(0)}</div>
                        )}
                        <div className="invite-details">
                            <p className="inviter-text">{invite.inviter.username} приглашает вас в</p>
                            <h2>{invite.server.name}</h2>
                            <div className="server-stats"><span className="dot online">●</span> {invite.server.memberCount} участников</div>
                            <button className="join-button-large" onClick={handleJoin} disabled={joining}>
                                {joining ? 'Вход...' : isElectron ? 'Присоединиться к серверу' : 'Продолжить в браузере'}
                            </button>
                            {!isElectron && (
                                <button className="open-app-button" onClick={() => { window.location.href = `zvon://invite/${code}`; }}>
                                    Открыть в приложении
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default InvitePage;
