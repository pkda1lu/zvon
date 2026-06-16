import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MonitorIcon, SmartphoneIcon, LogOutIcon } from '../../components/Icons';
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
    const { confirm } = useDialog();
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
            
            {loading && sessions.length === 0 ? (
                <div style={{ color: 'var(--text-dim)' }}>Загрузка сессий...</div>
            ) : (
                <>
                    <h3 className="settings-section-title">Текущее устройство</h3>
                    {sessions.filter(s => s.current).map(session => (
                        <div key={session.id} className="settings-card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '14px' }}>
                                {session.deviceType === 'mobile' || session.deviceType === 'tablet' 
                                    ? <SmartphoneIcon size={32} color="var(--success)" /> 
                                    : <MonitorIcon size={32} color="var(--success)" />}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--success)' }}>
                                    {session.deviceName || session.os} (Текущее)
                                </div>
                                <div style={{ fontSize: '14px', color: 'var(--text-dim)', marginTop: '4px' }}>
                                    {getFlag(session.countryCode)} {[session.city, session.country].filter(Boolean).join(', ') || 'Локация неизвестна'}
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-faint)', marginTop: '2px' }}>
                                    {session.browser} • Активно сейчас
                                </div>
                            </div>
                            <button 
                                className="settings-btn settings-btn-danger" 
                                onClick={() => revokeSession(session)}
                                disabled={revokingId === session.id}
                            >
                                {revokingId === session.id ? 'Выход...' : 'Выйти'}
                            </button>
                        </div>
                    ))}

                    {sessions.filter(s => !s.current).length > 0 && (
                        <>
                            <h3 className="settings-section-title">Другие устройства</h3>
                            {sessions.filter(s => !s.current).map(session => (
                                <div key={session.id} className="settings-card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                    <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '14px' }}>
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
                                        style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)' }}
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
        </div>
    );
};

export default DevicesSettings;
