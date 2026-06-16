import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MonitorIcon, SmartphoneIcon, LogOutIcon, ShieldIcon, CheckIcon } from '../../components/Icons';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';

interface DeviceSession {
    id: string;
    browser: string;
    os: string;
    deviceType: 'desktop' | 'mobile' | 'tablet' | 'app' | 'unknown';
    deviceName: string;
    ip: string;
    country: string;
    countryCode: string;
    city: string;
    createdAt: string;
    lastActiveAt: string;
    current: boolean;
}

const DevicesSettings: React.FC = () => {
    const { logout } = useAuth();
    const { confirm, alert } = useDialog();
    const [sessions, setSessions] = useState<DeviceSession[]>([]);
    const [loading, setLoading] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/sessions');
            setSessions(res.data || []);
        } catch (err) {
            console.error("Failed to load sessions", err);
        } finally {
            setLoading(false);
        }
    };

    const revokeSession = async (session: DeviceSession) => {
        const confirmed = await confirm(
            session.current
                ? 'Завершить текущую сессию? Вы выйдете из аккаунта на этом устройстве.'
                : `Завершить сессию «${session.deviceName || session.os}»? Это устройство выйдет из аккаунта.`
        );
        if (!confirmed) return;
        
        setRevokingId(session.id);
        try {
            const res = await axios.delete(`/api/sessions/${session.id}`);
            if (res.data?.current) {
                logout();
                window.location.href = '/login';
                return;
            }
            setSessions(prev => prev.filter(s => s.id !== session.id));
        } catch (err) {
            console.error("Failed to revoke session", err);
            alert('Ошибка при завершении сессии');
        } finally {
            setRevokingId(null);
        }
    };

    const revokeOtherSessions = async () => {
        const confirmed = await confirm('Вы уверены, что хотите завершить все сессии, кроме текущей?');
        if (!confirmed) return;

        setRevokingId('others');
        try {
            await axios.delete('/api/sessions/others');
            setSessions(prev => prev.filter(s => s.current));
            alert('Все остальные сессии успешно завершены');
        } catch (err) {
            alert('Ошибка при завершении сессий');
        } finally {
            setRevokingId(null);
        }
    };

    const getFlag = (countryCode: string) => {
        if (!countryCode) return '🏳️';
        return countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
    };

    const getTime = (isoString: string) => {
        if (!isoString) return 'Неизвестно';
        return new Date(isoString).toLocaleString('ru-RU', { 
            day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' 
        });
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Устройства</h2>
            <p className="settings-description">
                Список устройств, на которых вы вошли в свой аккаунт. Если вы заметили подозрительную активность, завершите сессию и смените пароль.
            </p>
            
            {loading && sessions.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px' }}>Загрузка сессий...</div>
            ) : (
                <>
                    <h3 className="settings-section-title">Текущее устройство</h3>
                    {sessions.filter(s => s.current).map(session => (
                        <div key={session.id} className="settings-card" style={{ display: 'flex', alignItems: 'center', gap: '20px', background: 'rgba(35, 165, 89, 0.05)', borderColor: 'rgba(35, 165, 89, 0.2)' }}>
                            <div style={{ padding: '16px', background: 'rgba(35, 165, 89, 0.1)', borderRadius: '16px', color: 'var(--success)' }}>
                                {session.deviceType === 'mobile' || session.deviceType === 'tablet' 
                                    ? <SmartphoneIcon size={32} /> 
                                    : <MonitorIcon size={32} />}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {session.deviceName || session.os}
                                    <span style={{ fontSize: '10px', background: 'var(--success)', color: '#fff', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>Текущее</span>
                                </div>
                                <div style={{ fontSize: '14px', color: 'var(--text-dim)', marginTop: '4px' }}>
                                    {getFlag(session.countryCode)} {[session.city, session.country].filter(Boolean).join(', ') || 'Локация неизвестна'} • {session.ip}
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-faint)', marginTop: '2px' }}>
                                    {session.browser} • Активно сейчас
                                </div>
                            </div>
                        </div>
                    ))}

                    {sessions.filter(s => !s.current).length > 0 && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '40px', marginBottom: '12px' }}>
                                <h3 className="settings-section-title" style={{ margin: 0 }}>Другие устройства</h3>
                                <button 
                                    className="settings-btn settings-btn-danger" 
                                    style={{ fontSize: '12px', padding: '6px 12px' }}
                                    onClick={revokeOtherSessions}
                                    disabled={revokingId === 'others'}
                                >
                                    Завершить все
                                </button>
                            </div>
                            {sessions.filter(s => !s.current).map(session => (
                                <div key={session.id} className="settings-card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                    <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', color: 'var(--text-dim)' }}>
                                        {session.deviceType === 'mobile' || session.deviceType === 'tablet' 
                                            ? <SmartphoneIcon size={32} /> 
                                            : <MonitorIcon size={32} />}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>
                                            {session.deviceName || session.os}
                                        </div>
                                        <div style={{ fontSize: '14px', color: 'var(--text-dim)', marginTop: '4px' }}>
                                            {getFlag(session.countryCode)} {[session.city, session.country].filter(Boolean).join(', ') || 'Локация неизвестна'}
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-faint)', marginTop: '2px' }}>
                                            {session.browser} • Активность: {getTime(session.lastActiveAt)}
                                        </div>
                                    </div>
                                    <button 
                                        className="settings-btn" 
                                        style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', padding: '10px' }}
                                        onClick={() => revokeSession(session)}
                                        disabled={revokingId === session.id}
                                    >
                                        <LogOutIcon size={18} />
                                    </button>
                                </div>
                            ))}
                        </>
                    )}
                </>
            )}

            <div className="settings-card" style={{ marginTop: '40px', background: 'rgba(0, 106, 255, 0.05)', border: '1px solid rgba(0, 106, 255, 0.2)' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <ShieldIcon size={24} color="var(--primary-neon)" />
                    <div>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px 0' }}>Совет по безопасности</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: 0, lineHeight: 1.5 }}>
                            Если вы завершили сессию на другом устройстве, но оно снова появилось в списке — возможно, ваш пароль скомпрометирован. Мы рекомендуем немедленно <span style={{ color: 'var(--primary-neon)', cursor: 'pointer', fontWeight: 600 }}>сменить пароль</span>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DevicesSettings;
