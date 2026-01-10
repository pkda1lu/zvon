import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../utils/avatar';
import './InvitePage.css';

const InvitePage: React.FC = () => {
    const { code } = useParams<{ code: string }>();
    const navigate = useNavigate();
    const { user: authUser, loading: authLoading } = useAuth();
    const [invite, setInvite] = useState<any>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);

    useEffect(() => {
        if (code) fetchInvite();
    }, [code]);

    const fetchInvite = async () => {
        try {
            const response = await axios.get(`/api/invites/${code}`);
            setInvite(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Приглашение недействительно или срок его действия истек');
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        if (authLoading) return;

        if (!authUser) {
            // Redirect to login but keep the invite code to return back
            navigate(`/login?returnTo=/invite/${code}`);
            return;
        }

        setJoining(true);
        try {
            await axios.post(`/api/invites/${code}/join`);
            navigate('/');
        } catch (err: any) {
            if (err.response?.data?.message === 'Already a member') {
                navigate('/');
            } else {
                setError(err.response?.data?.message || 'Не удалось присоединиться к серверу');
            }
        } finally {
            setJoining(false);
        }
    };

    // Auto-join if already in Electron and authenticated
    useEffect(() => {
        const isElectron = (window as any).electron;
        if (invite && isElectron && authUser && !joining && !error) {
            handleJoin();
        }
    }, [invite, authUser]);

    if (loading || authLoading) {
        return (
            <div className="invite-page-loading">
                <div className="loading-spinner-rings">
                    <div></div><div></div><div></div><div></div>
                </div>
                <span>Подготовка приглашения...</span>
            </div>
        );
    }

    const isElectron = (window as any).electron;

    return (
        <div className="invite-page-wrapper">
            <div className="invite-animated-bg">
                <div className="invite-blob"></div>
                <div className="invite-blob"></div>
                <div className="invite-blob"></div>
            </div>

            <div className="invite-card-premium">
                {error ? (
                    <div className="invite-error-content">
                        <div className="error-icon-glow">✕</div>
                        <h3>Упс! Что-то не так</h3>
                        <p>{error}</p>
                        <button className="primary-action-btn" onClick={() => navigate('/')}>На главную</button>
                    </div>
                ) : (
                    <div className="invite-success-content">
                        <div className="server-preview-header">
                            {invite.server.icon ? (
                                <div className="server-icon-glass">
                                    <img src={getAvatarUrl(invite.server.icon)!} alt="" />
                                </div>
                            ) : (
                                <div className="server-icon-placeholder-lux">
                                    {invite.server.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>

                        <div className="invite-text-content">
                            <span className="inviter-badge">{invite.inviter.username} приглашает вас</span>
                            <h2 className="server-title-lux">{invite.server.name}</h2>

                            {invite.server.description && (
                                <p className="server-desc-premium">{invite.server.description}</p>
                            )}

                            <div className="server-metrics">
                                <div className="metric-item">
                                    <span className="status-dot-pulse"></span>
                                    <strong>{invite.server.memberCount}</strong> участников
                                </div>
                            </div>

                            <div className="invite-actions-lux">
                                <button
                                    className="primary-action-btn join-btn-shine"
                                    onClick={handleJoin}
                                    disabled={joining}
                                >
                                    {joining ? 'Выполняется вход...' : authUser ? 'Принять приглашение' : 'Войти и вступить'}
                                </button>

                                {!isElectron && (
                                    <button
                                        className="secondary-action-btn"
                                        onClick={() => { window.location.href = `zvon://invite/${code}`; }}
                                    >
                                        Открыть в приложении
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="invite-footer-brand">
                <span>Zvon</span> • Новое поколение общения
            </div>
        </div>
    );
};

export default InvitePage;
