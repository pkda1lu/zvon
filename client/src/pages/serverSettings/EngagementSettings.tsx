import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Server } from '../../types';
import { SettingsToggle, CustomSelect } from '../settings/SettingsUI';
import { PlusIcon, TrashIcon } from '../../components/Icons';

interface Props {
    server: Server;
    onServerUpdate: (updatedServer: Server) => void;
}

const DEFAULT_WELCOME_MESSAGES = [
    'Добро пожаловать, {user}! Рады видеть тебя здесь.',
    '{user} присоединился к серверу. Поздоровайтесь!',
    'Встречайте {user} — новый участник сервера!'
];

const EngagementSettings: React.FC<Props> = ({ server, onServerUpdate }) => {
    const [welcomeEnabled, setWelcomeEnabled] = useState(server.welcomeEnabled !== false);
    const [messages, setMessages] = useState<string[]>(server.welcomeMessages || []);
    const [newMessage, setNewMessage] = useState('');
    const [welcomeChannel, setWelcomeChannel] = useState<string>(() => {
        const c = server.welcomeChannel;
        return typeof c === 'string' ? c : (c as any)?._id || '';
    });
    const [showMemberActivity, setShowMemberActivity] = useState(server.showMemberActivity !== false);

    const saveField = useCallback(async (field: string, value: any) => {
        try {
            const res = await axios.put(`/api/servers/${server._id}`, { [field]: value });
            onServerUpdate(res.data);
        } catch (e) {
            console.error(`Failed to save ${field}`, e);
        }
    }, [server._id, onServerUpdate]);

    // При открытии страницы сразу гарантируем непустой пул приветствий (3 по умолчанию)
    // и валидный выбранный канал — состояние "не выбран" здесь не должно существовать,
    // пока на сервере есть хотя бы один текстовый канал.
    useEffect(() => {
        setWelcomeEnabled(server.welcomeEnabled !== false);
        setShowMemberActivity(server.showMemberActivity !== false);

        const textChannels = (server.channels || []).filter(c => c.type === 'text');
        const rawChannel = server.welcomeChannel;
        const currentChannelId = typeof rawChannel === 'string' ? rawChannel : (rawChannel as any)?._id || '';
        const channelIsValid = !!currentChannelId && textChannels.some(c => c._id === currentChannelId);
        const finalChannelId = channelIsValid ? currentChannelId : (textChannels[0]?._id || '');
        setWelcomeChannel(finalChannelId);

        const existingMessages = server.welcomeMessages || [];
        const finalMessages = existingMessages.length > 0 ? existingMessages : DEFAULT_WELCOME_MESSAGES;
        setMessages(finalMessages);

        const payload: Record<string, any> = {};
        if (existingMessages.length === 0) payload.welcomeMessages = finalMessages;
        if (finalChannelId && finalChannelId !== currentChannelId) payload.welcomeChannel = finalChannelId;
        if (Object.keys(payload).length > 0) {
            axios.put(`/api/servers/${server._id}`, payload).then(res => onServerUpdate(res.data)).catch(() => {});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [server._id]);

    const textChannels = (server.channels || []).filter(c => c.type === 'text');
    const channelOptions = textChannels.map(c => ({ id: c._id, name: `#${c.name}` }));

    const handleToggleWelcome = (v: boolean) => {
        setWelcomeEnabled(v);
        const payload: Record<string, any> = { welcomeEnabled: v };
        // При первом включении на пустом пуле сразу предлагаем 3 приветствия и канал по умолчанию.
        if (v && messages.length === 0) {
            payload.welcomeMessages = DEFAULT_WELCOME_MESSAGES;
            setMessages(DEFAULT_WELCOME_MESSAGES);
        }
        if (v && !welcomeChannel && textChannels.length > 0) {
            payload.welcomeChannel = textChannels[0]._id;
            setWelcomeChannel(textChannels[0]._id);
        }
        (async () => {
            try {
                const res = await axios.put(`/api/servers/${server._id}`, payload);
                onServerUpdate(res.data);
            } catch (e) {
                console.error('Failed to save welcomeEnabled', e);
            }
        })();
    };

    const addMessage = () => {
        const text = newMessage.trim();
        if (!text || messages.length >= 10) return;
        const updated = [...messages, text];
        setMessages(updated);
        setNewMessage('');
        saveField('welcomeMessages', updated);
    };

    const removeMessage = (i: number) => {
        const updated = messages.filter((_, idx) => idx !== i);
        setMessages(updated);
        saveField('welcomeMessages', updated);
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Вовлечённость</h2>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Приветствие при присоединении</h3>
                        <p>
                            При входе нового участника случайно выбирается одно из сообщений ниже и отправляется в выбранный канал.
                            Используйте <code>{'{user}'}</code>, чтобы вставить имя нового участника.
                        </p>
                    </div>
                    <SettingsToggle checked={welcomeEnabled} onChange={handleToggleWelcome} />
                </div>

                <div style={{ opacity: welcomeEnabled ? 1 : 0.4, pointerEvents: welcomeEnabled ? 'auto' : 'none' }}>
                    <div className="settings-sidebar-divider" style={{ margin: '20px 0' }} />

                    <p className="settings-description" style={{ marginTop: 0 }}>Пул приветствий (максимум 10):</p>
                    <div className="server-settings-tag-list">
                        {messages.map((m, i) => (
                            <div key={i} className="server-settings-tag-row">
                                <input className="settings-input" value={m} readOnly />
                                <button className="action-button danger" onClick={() => removeMessage(i)}><TrashIcon size={16} /></button>
                            </div>
                        ))}
                    </div>
                    {messages.length < 10 && (
                        <div className="server-settings-tag-row" style={{ marginTop: '10px' }}>
                            <input
                                className="settings-input"
                                placeholder="Новое приветствие, например: Привет, {user}!"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') addMessage(); }}
                            />
                            <button className="action-button" onClick={addMessage}><PlusIcon size={16} /></button>
                        </div>
                    )}

                    <div className="settings-sidebar-divider" style={{ margin: '20px 0' }} />

                    <h3 className="settings-section-title" style={{ marginTop: 0 }}>Чат для приветствий</h3>
                    <p className="settings-description">Канал, доступный всем участникам, в который будет отправляться приветствие.</p>
                    <CustomSelect options={channelOptions} value={welcomeChannel} onChange={(id) => { setWelcomeChannel(id); saveField('welcomeChannel', id); }} placeholder="Выберите канал..." />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>События сервера</h3>
                        <p>Показывать текущие действия участников (игры, стримы, голосовые каналы) в списке участников справа от чата.</p>
                    </div>
                    <SettingsToggle checked={showMemberActivity} onChange={(v) => { setShowMemberActivity(v); saveField('showMemberActivity', v); }} />
                </div>
            </div>
        </div>
    );
};

export default EngagementSettings;
