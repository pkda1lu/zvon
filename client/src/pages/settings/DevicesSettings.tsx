import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MonitorIcon, SmartphoneIcon, LogOutIcon, ShieldIcon } from '../../components/Icons';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';

interface DeviceSession {
    id: string;
    browser: string;
    os: string;
    deviceType: 'desktop' | 'mobile' | 'tablet' | 'app' | 'unknown';
    deviceName: string;
    deviceId: string;
    ip: string;
    country: string;
    countryCode: string;
    city: string;
    createdAt: string;
    lastActiveAt: string;
    current: boolean;
}

interface DeviceLocation {
    ip: string;
    city: string;
    country: string;
    countryCode: string;
    lastActiveAt: string;
}

interface DeviceGroup {
    key: string;
    deviceType: DeviceSession['deviceType'];
    deviceName: string;
    os: string;
    browser: string;
    current: boolean;
    sessionIds: string[];
    lastActiveAt: string;
    locations: DeviceLocation[];
}

// Ключ группировки: стабильный deviceId, а если его нет (старая сессия) —
// сигнатура устройства, чтобы входы с одного устройства не дробились по IP.
const groupKey = (s: DeviceSession) =>
    s.deviceId ? `id:${s.deviceId}` : `sig:${s.deviceType}|${s.os}|${s.browser}|${s.deviceName}`;

const groupSessions = (sessions: DeviceSession[]): DeviceGroup[] => {
    const map = new Map<string, DeviceGroup>();
    for (const s of sessions) {
        const key = groupKey(s);
        let g = map.get(key);
        if (!g) {
            g = {
                key,
                deviceType: s.deviceType,
                deviceName: s.deviceName,
                os: s.os,
                browser: s.browser,
                current: false,
                sessionIds: [],
                lastActiveAt: s.lastActiveAt,
                locations: []
            };
            map.set(key, g);
        }
        g.sessionIds.push(s.id);
        if (s.current) g.current = true;
        if (new Date(s.lastActiveAt) > new Date(g.lastActiveAt)) g.lastActiveAt = s.lastActiveAt;
        // Уникальные локации по IP — показываем, откуда были входы.
        if (!g.locations.some(l => l.ip === s.ip)) {
            g.locations.push({ ip: s.ip, city: s.city, country: s.country, countryCode: s.countryCode, lastActiveAt: s.lastActiveAt });
        }
    }
    // Текущее устройство — первым, остальные по свежести.
    return Array.from(map.values()).sort((a, b) => {
        if (a.current !== b.current) return a.current ? -1 : 1;
        return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
    });
};

const DevicesSettings: React.FC = () => {
    const { logout } = useAuth();
    const { confirm, alert } = useDialog();
    const [sessions, setSessions] = useState<DeviceSession[]>([]);
    const [loading, setLoading] = useState(false);
    const [revokingKey, setRevokingKey] = useState<string | null>(null);

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

    const revokeGroup = async (group: DeviceGroup) => {
        const confirmed = await confirm(
            group.current
                ? 'Завершить сессии текущего устройства? Вы выйдете из аккаунта на этом устройстве.'
                : `Завершить все сессии устройства «${group.deviceName || group.os}»? Это устройство выйдет из аккаунта.`
        );
        if (!confirmed) return;

        setRevokingKey(group.key);
        try {
            const res = await axios.post('/api/sessions/revoke-group', { ids: group.sessionIds });
            if (res.data?.current) {
                logout();
                window.location.href = '/login';
                return;
            }
            setSessions(prev => prev.filter(s => !group.sessionIds.includes(s.id)));
        } catch (err) {
            console.error("Failed to revoke device", err);
            alert('Ошибка при завершении сессий устройства');
        } finally {
            setRevokingKey(null);
        }
    };

    const revokeOtherSessions = async () => {
        const confirmed = await confirm('Вы уверены, что хотите завершить все сессии, кроме текущей?');
        if (!confirmed) return;

        setRevokingKey('others');
        try {
            await axios.delete('/api/sessions/others');
            setSessions(prev => prev.filter(s => s.current));
            alert('Все остальные сессии успешно завершены');
        } catch (err) {
            alert('Ошибка при завершении сессий');
        } finally {
            setRevokingKey(null);
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

    const locationLabel = (l: DeviceLocation) =>
        `${getFlag(l.countryCode)} ${[l.city, l.country].filter(Boolean).join(', ') || 'Локация неизвестна'} • ${l.ip}`;

    const groups = groupSessions(sessions);
    const currentGroup = groups.find(g => g.current);
    const otherGroups = groups.filter(g => !g.current);

    const renderLocations = (group: DeviceGroup) => (
        <div style={{ fontSize: '14px', color: 'var(--text-dim)', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {group.locations.slice(0, 4).map((l, i) => (
                <div key={i}>{locationLabel(l)}</div>
            ))}
            {group.locations.length > 4 && (
                <div style={{ color: 'var(--text-faint)' }}>и ещё {group.locations.length - 4} локаций</div>
            )}
        </div>
    );

    const deviceMeta = (group: DeviceGroup, current: boolean) => {
        const ipCount = group.locations.length;
        const ipNote = ipCount > 1 ? ` • ${ipCount} IP` : '';
        return `${group.browser}${ipNote} • ${current ? 'Активно сейчас' : `Активность: ${getTime(group.lastActiveAt)}`}`;
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Устройства</h2>
            <p className="settings-description">
                Список устройств, на которых вы вошли в свой аккаунт. Входы с одного устройства сгруппированы вместе, даже если IP-адрес менялся.
            </p>

            {loading && sessions.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px' }}>Загрузка сессий...</div>
            ) : (
                <>
                    <h3 className="settings-section-title">Текущее устройство</h3>
                    {currentGroup && (
                        <div className="settings-list" style={{ marginBottom: '8px' }}>
                            <div className="settings-list-row">
                                <div className="settings-list-row-icon" style={{ color: 'var(--success)', background: 'rgba(35, 165, 89, 0.1)' }}>
                                    {currentGroup.deviceType === 'mobile' || currentGroup.deviceType === 'tablet'
                                        ? <SmartphoneIcon size={20} />
                                        : <MonitorIcon size={20} />}
                                </div>
                                <div className="settings-list-row-body">
                                    <div className="settings-list-row-title">
                                        {currentGroup.deviceName || currentGroup.os}
                                        <span className="settings-list-row-tag" style={{ background: 'var(--success)' }}>Текущее</span>
                                    </div>
                                    <div className="settings-list-row-meta">
                                        {renderLocations(currentGroup)}
                                        <div>{deviceMeta(currentGroup, true)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {otherGroups.length > 0 && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '40px', marginBottom: '12px' }}>
                                <h3 className="settings-section-title" style={{ margin: 0 }}>Другие устройства</h3>
                                <button
                                    className="settings-btn settings-btn-danger"
                                    style={{ fontSize: '12px', padding: '6px 12px' }}
                                    onClick={revokeOtherSessions}
                                    disabled={revokingKey === 'others'}
                                >
                                    Завершить все
                                </button>
                            </div>
                            <div className="settings-list">
                                {otherGroups.map(group => (
                                    <div key={group.key} className="settings-list-row">
                                        <div className="settings-list-row-icon">
                                            {group.deviceType === 'mobile' || group.deviceType === 'tablet'
                                                ? <SmartphoneIcon size={20} />
                                                : <MonitorIcon size={20} />}
                                        </div>
                                        <div className="settings-list-row-body">
                                            <div className="settings-list-row-title">
                                                {group.deviceName || group.os}
                                            </div>
                                            <div className="settings-list-row-meta">
                                                {renderLocations(group)}
                                                <div>{deviceMeta(group, false)}</div>
                                            </div>
                                        </div>
                                        <div className="settings-list-row-actions">
                                            <button
                                                className="action-button"
                                                onClick={() => revokeGroup(group)}
                                                disabled={revokingKey === group.key}
                                                title="Завершить все сессии устройства"
                                            >
                                                <LogOutIcon size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
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
                            Если вы завершили сессию, но она снова появилось — возможно, ваш пароль скомпрометирован. Мы рекомендуем немедленно <span style={{ color: 'var(--primary-neon)', cursor: 'pointer', fontWeight: 600 }}>сменить пароль</span>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DevicesSettings;
