import React, { useCallback, useEffect, useState } from 'react';
import { SettingsToggle } from './SettingsUI';
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
 * Настройки push-уведомлений.
 *
 * Отдельная страница нужна не столько ради тумблера, сколько ради объяснений:
 * на iPhone уведомления физически не включаются из вкладки Safari, и без
 * подсказки про «Поделиться → На экран Домой» пользователь просто решит, что
 * ничего не работает.
 *
 * Разрешение запрашивается строго из обработчика клика — на iOS вызов
 * Notification.requestPermission() вне жеста пользователя молча игнорируется.
 */
const NotificationsSettings: React.FC = () => {
    const [status, setStatus] = useState<PushStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const state = await getPushState();
            setStatus(state.status);
        } catch {
            setStatus('unsupported');
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const handleToggle = async (next: boolean) => {
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

    const handleTest = async () => {
        setBusy(true);
        setMessage(null);
        try {
            await sendTestPush();
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

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Уведомления на устройство</h3>
                        <p>
                            Личные сообщения и упоминания будут приходить, даже когда
                            Zvon закрыт. Пока приложение открыто, уведомление не
                            дублируется — вы и так видите его внутри.
                        </p>
                    </div>
                    <SettingsToggle
                        checked={enabled}
                        onChange={(v) => { if (!busy && canToggle) handleToggle(v); }}
                    />
                </div>

                {renderHint() && (
                    <div className="settings-row" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                        {renderHint()}
                    </div>
                )}
            </div>

            {enabled && (
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-text">
                            <h3>Проверка</h3>
                            <p>Отправить себе тестовое уведомление.</p>
                        </div>
                        <button className="settings-btn" disabled={busy} onClick={handleTest}>
                            Отправить
                        </button>
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
