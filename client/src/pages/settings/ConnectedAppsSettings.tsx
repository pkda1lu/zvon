import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { LinkIcon, LogOutIcon, ShieldIcon } from '../../components/Icons';
import { useDialog } from '../../contexts/DialogContext';

/**
 * Приложения, которым выдан доступ через Vlyne ID.
 *
 * Экран согласия обещает, что доступ можно отозвать в настройках, — это и есть
 * то место. Без него единый вход был бы дорогой в одну сторону: нажатие
 * «Разрешить» навсегда, без возможности передумать.
 */

interface ScopeDetail {
    scope: string;
    title: string;
    description: string;
}

interface ConnectedApp {
    id: string;
    clientId: string;
    name: string;
    description: string;
    logo: string | null;
    homepageUrl: string;
    firstParty: boolean;
    scopes: string[];
    scopeDetails: ScopeDetail[];
    createdAt: string;
    lastUsedAt: string;
}

const formatDate = (iso: string) => {
    if (!iso) return 'неизвестно';
    return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
};

const ConnectedAppsSettings: React.FC = () => {
    const { confirm, alert } = useDialog();
    const [apps, setApps] = useState<ConnectedApp[]>([]);
    const [loading, setLoading] = useState(true);
    const [revoking, setRevoking] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await axios.get('/api/vlyne-id/grants');
                setApps(res.data || []);
            } catch (err) {
                console.error('Не удалось загрузить подключённые приложения', err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const revoke = async (app: ConnectedApp) => {
        const confirmed = await confirm(
            `Отключить «${app.name}» от вашего Vlyne ID? Приложение потеряет доступ к аккаунту, ` +
            'а при следующем входе снова спросит разрешение.'
        );
        if (!confirmed) return;

        setRevoking(app.clientId);
        try {
            await axios.delete(`/api/vlyne-id/grants/${app.clientId}`);
            setApps(prev => prev.filter(a => a.clientId !== app.clientId));
        } catch (err) {
            alert('Не удалось отключить приложение');
        } finally {
            setRevoking(null);
        }
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Подключённые приложения</h2>
            <p className="settings-description">
                Приложения экосистемы Vlyne, которым вы разрешили вход через свой аккаунт.
                Пароль им не передаётся — только те данные, что перечислены в разрешении.
            </p>

            {loading ? (
                <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px' }}>Загрузка…</div>
            ) : apps.length === 0 ? (
                <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px' }}>
                    Пока ни одно приложение не подключено.
                </div>
            ) : (
                <div className="settings-list">
                    {apps.map(app => (
                        <div key={app.clientId} className="settings-list-row">
                            <div className="settings-list-row-icon">
                                {app.logo
                                    ? <img src={app.logo} alt="" style={{ width: 20, height: 20, borderRadius: 6, objectFit: 'cover' }} />
                                    : <LinkIcon size={20} />}
                            </div>
                            <div className="settings-list-row-body">
                                <div className="settings-list-row-title">
                                    {app.name}
                                    {app.firstParty && (
                                        <span className="settings-list-row-tag" style={{ background: 'var(--primary-neon)' }}>Vlyne</span>
                                    )}
                                </div>
                                <div className="settings-list-row-meta">
                                    {app.description && <div>{app.description}</div>}
                                    <div style={{ marginTop: 4 }}>
                                        Доступ: {app.scopeDetails.map(s => s.title).join(', ') || 'только идентификатор'}
                                    </div>
                                    <div style={{ color: 'var(--text-faint)', marginTop: 2 }}>
                                        Подключено {formatDate(app.createdAt)} • Использовано {formatDate(app.lastUsedAt)}
                                    </div>
                                </div>
                            </div>
                            <div className="settings-list-row-actions">
                                <button
                                    className="action-button"
                                    onClick={() => revoke(app)}
                                    disabled={revoking === app.clientId}
                                    title="Отключить приложение"
                                >
                                    <LogOutIcon size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="settings-card" style={{ marginTop: '40px', background: 'rgba(0, 106, 255, 0.05)', border: '1px solid rgba(0, 106, 255, 0.2)' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <ShieldIcon size={24} color="var(--primary-neon)" />
                    <div>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px 0' }}>Что такое Vlyne ID</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: 0, lineHeight: 1.5 }}>
                            Ваш аккаунт здесь — это Vlyne ID: один вход для всех проектов экосистемы.
                            Отключение приложения тут же обрывает его доступ, даже если оно уже вошло.
                            {' '}
                            <a
                                href="https://vlyneid.zvonserver.ru"
                                target="_blank"
                                rel="noreferrer noopener"
                                style={{ color: 'var(--primary-neon)', fontWeight: 600 }}
                            >
                                Подробнее
                            </a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConnectedAppsSettings;
