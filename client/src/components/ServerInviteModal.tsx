import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import AnimatedOverlay from '../animations/AnimatedOverlay';
import { getAvatarUrl } from '../utils/avatar';

interface ServerInviteModalProps {
    isOpen: boolean;
    onClose: () => void;
    serverId: string;
    onJoined: (server: any) => void;
}

// Модалка-приглашение: открывается при клике на сервер, в котором пользователя нет
// (например, основной сервер в карточке профиля). Показывает превью сервера
// и кнопку «Присоединиться».
const ServerInviteModal: React.FC<ServerInviteModalProps> = ({ isOpen, onClose, serverId, onJoined }) => {
    const [server, setServer] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState('');

    const fetchServer = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const res = await axios.get(`/api/servers/${serverId}`);
            setServer(res.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Не удалось загрузить сервер');
        } finally {
            setLoading(false);
        }
    }, [serverId]);

    useEffect(() => {
        if (isOpen && serverId) fetchServer();
    }, [isOpen, serverId, fetchServer]);

    const handleJoin = async () => {
        setJoining(true); setError('');
        try {
            const res = await axios.post(`/api/servers/${serverId}/join`);
            onJoined(res.data);
            onClose();
        } catch (err: any) {
            if (err.response?.data?.message === 'Already a member') {
                onJoined(server);
                onClose();
            } else {
                setError(err.response?.data?.message || 'Не удалось присоединиться к серверу');
            }
        } finally {
            setJoining(false);
        }
    };

    const memberCount = server?.members?.length ?? 0;

    return (
        <AnimatedOverlay
            isOpen={isOpen}
            onClose={onClose}
            overlayClassName="modal-overlay"
            contentClassName="glass-panel-base"
            contentStyle={{
                width: '100%',
                maxWidth: '460px',
                padding: '60px 40px 40px',
                textAlign: 'center',
                boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
                margin: '20px',
                overflow: 'visible',
                position: 'relative',
            }}
        >
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '40px 0' }}>
                    <span style={{ color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '1px' }}>ЗАГРУЗКА ПРИГЛАШЕНИЯ...</span>
                </div>
            ) : error && !server ? (
                <div style={{ padding: '20px 0' }}>
                    <div style={{
                        margin: '0 auto 30px', width: '80px', height: '80px',
                        background: 'rgba(255, 59, 48, 0.1)', border: '1px solid rgba(255, 59, 48, 0.3)',
                        borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#ff3b30', fontSize: '32px', fontWeight: 'bold'
                    }}>✕</div>
                    <h2 style={{ color: 'white', marginBottom: '15px', fontSize: '24px' }}>Упс! Что-то не так</h2>
                    <p style={{ color: 'var(--text-dim)', marginBottom: '30px' }}>{error}</p>
                    <button className="neon-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--glass-border)', boxShadow: 'none', width: '100%', padding: '16px' }} onClick={onClose}>Закрыть</button>
                </div>
            ) : server ? (
                <>
                    {/* Иконка сервера поверх верхнего края */}
                    <div style={{
                        position: 'absolute', top: '-50px', left: '50%', transform: 'translateX(-50%)',
                        width: '100px', height: '100px', background: 'var(--bg-dark)',
                        borderRadius: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '2px solid var(--primary-neon)', overflow: 'hidden',
                        boxShadow: '0 20px 40px rgba(0, 229, 255, 0.3)'
                    }}>
                        {server.icon ? (
                            <img src={getAvatarUrl(server.icon)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--primary-neon)' }}>
                                {server.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--primary-neon)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '10px' }}>
                        Вас приглашают присоединиться
                    </div>
                    <h1 style={{ color: 'white', fontSize: '30px', fontWeight: 800, marginBottom: '15px', letterSpacing: '-1px' }}>{server.name}</h1>

                    {server.description && (
                        <p style={{ color: 'var(--text-dim)', fontSize: '14px', lineHeight: '1.5', marginBottom: '20px' }}>{server.description}</p>
                    )}

                    {(server.features || []).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px', marginBottom: '20px' }}>
                            {(server.features as string[]).map((f, i) => (
                                <span key={i} className="server-settings-role-tag">{f}</span>
                            ))}
                        </div>
                    )}

                    {(server.featuredActivities || []).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
                            {(server.featuredActivities as { name: string; image?: string | null }[]).map((a, i) => (
                                <div key={`${a.name}-${i}`} title={a.name} style={{ width: '36px', height: '36px', borderRadius: '10px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)' }}>
                                    {a.image ? (
                                        <img src={getAvatarUrl(a.image)!} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <span style={{ fontSize: '14px', fontWeight: 800, color: 'white' }}>{a.name.charAt(0).toUpperCase()}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '8px 16px', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '35px' }}>
                        <span style={{ width: '8px', height: '8px', background: 'var(--primary-neon)', borderRadius: '50%', boxShadow: '0 0 10px var(--primary-neon)' }}></span>
                        <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>{memberCount} участников</span>
                    </div>

                    {error && <div style={{ color: 'var(--accent-pink)', fontSize: '13px', marginBottom: '15px' }}>{error}</div>}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <button className="neon-btn" style={{ width: '100%', padding: '18px' }} onClick={handleJoin} disabled={joining}>
                            {joining ? 'Присоединение...' : 'Присоединиться к серверу'}
                        </button>
                    </div>
                </>
            ) : null}
        </AnimatedOverlay>
    );
};

export default ServerInviteModal;
