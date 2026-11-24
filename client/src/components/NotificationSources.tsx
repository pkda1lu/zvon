import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Server } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { SettingsToggle } from '../pages/settings/SettingsUI';
import './NotificationSources.css';
import ZvSelect from './ZvSelect';
import { BellOffIcon, HashtagIcon } from './Icons';

export default function NotificationSources() {
    const { user, refreshUser } = useAuth();
    const [servers, setServers] = useState<Server[]>([]);
    const [selected, setSelected] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        axios.get<Server[]>('/api/servers/me', { signal: controller.signal }).then(({ data }) => {
            if (!controller.signal.aborted) {
                setServers(data);
                setSelected(previous => data.some(server => server._id === previous) ? previous : data[0]?._id || '');
            }
        }).catch(() => {
            if (!controller.signal.aborted) setError('Не удалось загрузить серверы.');
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [revision]);

    const server = servers.find(item => item._id === selected);
    const serverMuted = !!user?.mutedServers?.includes(selected);
    const toggle = async (kind: 'servers' | 'channels', id: string, muted: boolean) => {
        setBusy(true);
        setError('');
        try {
            await axios.post(`/api/${kind}/${id}/mute`, { muted });
            await refreshUser();
        } catch {
            setError('Не удалось сохранить настройку. Попробуйте ещё раз.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="notification-sources">
            <h3>Уведомления серверов и каналов</h3>
            <p>Мут отключает звук, всплывающие и push-уведомления, включая упоминания. История уведомлений сохраняется.</p>
            {error && <p role="alert">{error} <button type="button" className="inbox-action-btn" onClick={() => setRevision(value => value + 1)}>Повторить</button></p>}
            {loading ? <p role="status">Загрузка…</p> : servers.length === 0 ? (
                !error && <p>Вы ещё не присоединились к серверам.</p>
            ) : (
                <>
                    <label htmlFor="notification-server">Сервер</label>
                    <ZvSelect id="notification-server" aria-label="Сервер" value={selected} onChange={event => setSelected(event.target.value)} disabled={busy}>
                        {servers.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}
                    </ZvSelect>
                    <div className="notification-source-row">
                        <span className="notification-source-name"><BellOffIcon size={18} /><span>Заглушить сервер</span></span>
                        <SettingsToggle label="Заглушить сервер" checked={serverMuted} disabled={busy} onChange={value => toggle('servers', selected, value)} />
                    </div>
                    {server?.channels.filter(channel => channel.type === 'text' || channel.type === 'room').map(channel => (
                        <div className="notification-source-row" key={channel._id}>
                            <span className="notification-source-name"><HashtagIcon size={18} /><span>{channel.name}{serverMuted && <small>Заглушён вместе с сервером</small>}</span></span>
                            <SettingsToggle label={`Заглушить канал ${channel.name}`} checked={!!user?.mutedChannels?.includes(channel._id)} disabled={busy || serverMuted}
                                onChange={value => toggle('channels', channel._id, value)} />
                        </div>
                    ))}
                </>
            )}
        </section>
    );
}
