import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { SettingsToggle } from './SettingsUI';
import { useAuth } from '../../contexts/AuthContext';
import {
    getPushState,
    enablePush,
    disablePush,
    sendTestPush,
    isIos,
    isStandalone,
    type PushStatus,
} from '../../utils/webPush';

/**
 * Настройки push-уведомлений PWA и категорий доставки.
 */
const NotificationsSettings: React.FC = () => {
    const { user, updateUser } = useAuth();
    const [status, setStatus] = useState<PushStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    // Локальные настройки категорий из профиля пользователя
    const notifications = user?.settings?.notifications || {
        directMessages: true,
        channelMentions: true,
        voiceCalls: true,
        friendRequests: true,
        showPreview: true,
        showAttachments: true
    };

    const refresh = useCallback(async () => {
        try {
            const state = await getPushState();
            setStatus(state.status);
        } catch {
            setStatus('unsupported');
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const handleTogglePush = async (next: boolean) => {
        setBusy(true);
        setMessage(null);
        try {
            if (next) {
                const res = await enablePush();
                if (!res.ok) setMessage(res.reason || 'Не удалось включить уведомления.');
            } else {
                await disablePush();
            }
        } catch (err: any) {
            setMessage(err?.message || 'Не удалось изменить настройку.');
        } finally {
            await refresh();
            setBusy(false);
        }
    };

    const updateNotificationPref = async (key: keyof typeof notifications, value: boolean) => {
        const nextPrefs = { ...notifications, [key]: value };
        // Оптимистичное обновление в UI
        if (user) {
            updateUser({
                settings: {
                    ...(user.settings || {}),
                    notifications: nextPrefs
                } as any
            });
        }

        try {
            await axios.put('/api/users/settings', {
                settings: { notifications: nextPrefs }
            });
        } catch (err) {
            console.error('Ошибка сохранения настроек уведомлений:', err);
        }
    };

    const handleTest = async (withAttachment = false) => {
        setBusy(true);
        setMessage(null);
        try {
            await sendTestPush(withAttachment);
            setMessage('Уведомление отправлено. Если приложение открыто на этом устройстве, сверните его — уведомления приходят, когда приложение закрыто.');
        } catch {
            setMessage('Не удалось отправить тестовое уведомление.');
        } finally {
            setBusy(false);
        }
    };

    const enabled = status === 'enabled';
    const canToggle = status === 'enabled' || status === 'disabled';

    const renderHint = () => {
        switch (status) {
            case 'ios-needs-install':
                return (
                    <div className="settings-row-text">
                        <p>
                            На iPhone и iPad уведомления работают только у приложения,
                            добавленного на домашний экран. В обычной вкладке Safari
                            их включить нельзя.
                        </p>
                        <p style={{ marginTop: 8 }}>
                            Откройте Zvon в Safari, нажмите «Поделиться», выберите
                            «На экран «Домой»», затем запустите Zvon с домашнего экрана
                            и вернитесь на эту страницу. Нужна iOS 16.4 или новее.
                        </p>
                    </div>
                );
            case 'denied':
                return (
                    <div className="settings-row-text">
                        <p>
                            Уведомления запрещены в настройках браузера или системы.
                            Разрешите их для Zvon и вернитесь сюда.
                        </p>
                    </div>
                );
            case 'server-disabled':
                return (
                    <div className="settings-row-text">
                        <p>Push-уведомления не настроены на сервере. Обратитесь к администратору.</p>
                    </div>
                );
            case 'unsupported':
                return (
                    <div className="settings-row-text">
                        <p>Этот браузер не поддерживает push-уведомления.</p>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Уведомления</h2>

            {/* Системный статус и подписка PWA */}
            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Уведомления на устройство (Web Push)</h3>
                        <p>
                            Личные сообщения, звонки и упоминания будут приходить через PWA, даже когда
                            Zvon полностью закрыт. Пока приложение активно, системные уведомления не
                            дублируются.
                        </p>
                    </div>
                    <SettingsToggle
                        checked={enabled}
                        onChange={(v) => { if (!busy && canToggle) handleTogglePush(v); }}
                    />
                </div>

                {renderHint() && (
                    <div className="settings-row" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                        {renderHint()}
                    </div>
                )}
            </div>

            {/* Категории уведомлений */}
            <div className="settings-card">
                <h3 className="settings-section-title" style={{ marginTop: 0 }}>Категории уведомлений</h3>
                <p className="settings-description">
                    Выберите, о каких событиях отправлять системные уведомления на устройство.
                </p>

                <div className="settings-row">
                    <div className="settings-row-text">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>💬</span>
                            <h4>Личные сообщения и группы</h4>
                        </div>
                        <p>Сообщения в личных диалогах и групповых беседах.</p>
                    </div>
                    <SettingsToggle
                        checked={notifications.directMessages ?? true}
                        onChange={(v) => updateNotificationPref('directMessages', v)}
                    />
                </div>

                <div className="settings-row" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                    <div className="settings-row-text">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>📢</span>
                            <h4>Упоминания в каналах серверов</h4>
                        </div>
                        <p>Когда вас персонально упоминают (@никнейм) в текстовом канале.</p>
                    </div>
                    <SettingsToggle
                        checked={notifications.channelMentions ?? true}
                        onChange={(v) => updateNotificationPref('channelMentions', v)}
                    />
                </div>

                <div className="settings-row" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                    <div className="settings-row-text">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>📞</span>
                            <h4>Входящие голосовые вызовы</h4>
                        </div>
                        <p>Срочные системные звонки в личных беседах и группах.</p>
                    </div>
                    <SettingsToggle
                        checked={notifications.voiceCalls ?? true}
                        onChange={(v) => updateNotificationPref('voiceCalls', v)}
                    />
                </div>

                <div className="settings-row" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                    <div className="settings-row-text">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>👋</span>
                            <h4>Запросы в друзья</h4>
                        </div>
                        <p>Уведомления о новых входящих запросах и принятых заявках в друзья.</p>
                    </div>
                    <SettingsToggle
                        checked={notifications.friendRequests ?? true}
                        onChange={(v) => updateNotificationPref('friendRequests', v)}
                    />
                </div>
            </div>

            {/* Конфиденциальность и медиа */}
            <div className="settings-card">
                <h3 className="settings-section-title" style={{ marginTop: 0 }}>Конфиденциальность и медиа</h3>
                <p className="settings-description">
                    Настройте вид уведомлений на заблокированном экране вашего устройства.
                </p>

                <div className="settings-row">
                    <div className="settings-row-text">
                        <h4>Показывать текст сообщения (превью)</h4>
                        <p>Если отключено, в тексте уведомления будет отображаться только «Новое сообщение».</p>
                    </div>
                    <SettingsToggle
                        checked={notifications.showPreview ?? true}
                        onChange={(v) => updateNotificationPref('showPreview', v)}
                    />
                </div>

                <div className="settings-row" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                    <div className="settings-row-text">
                        <h4>Превью изображений и вложений</h4>
                        <p>Отображать прикреплённую картинку большим баннером в системном пуше.</p>
                    </div>
                    <SettingsToggle
                        checked={notifications.showAttachments ?? true}
                        onChange={(v) => updateNotificationPref('showAttachments', v)}
                    />
                </div>
            </div>

            {/* Проверка отправки */}
            {enabled && (
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-text">
                            <h3>Проверка уведомлений</h3>
                            <p>Отправить себе тестовый push для проверки звука, иконки и отображения вложений.</p>
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button className="settings-btn" disabled={busy} onClick={() => handleTest(false)}>
                                Обычное
                            </button>
                            <button className="settings-btn" disabled={busy} onClick={() => handleTest(true)} style={{ background: 'rgba(255,255,255,0.1)' }}>
                                С вложением 📷
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {message && (
                <div className="settings-card">
                    <div className="settings-row-text"><p>{message}</p></div>
                </div>
            )}

            {isIos() && isStandalone() && status !== 'enabled' && (
                <div className="settings-card">
                    <div className="settings-row-text">
                        <p>
                            Приложение запущено с домашнего экрана — это правильный режим.
                            Если тумблер не включается, проверьте, что в настройках iPhone
                            для Zvon разрешены уведомления.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationsSettings;
