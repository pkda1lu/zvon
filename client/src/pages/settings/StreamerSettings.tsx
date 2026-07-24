import React from 'react';
import { useWindowSettings } from '../../contexts/WindowSettingsContext';
import { SettingsToggle } from './SettingsUI';
import { getBrand } from '../../utils/branding';

const StreamerSettings: React.FC = () => {
    const brand = getBrand();
    const {
        streamerModeEnabled, setStreamerModeEnabled,
        autoEnableWithOBS, setAutoEnableWithOBS,
        streamerLink, setStreamerLink,
        censorInfo, setCensorInfo,
        disableSounds, setDisableSounds,
        disableNotifications, setDisableNotifications,
        changeStatusToStreaming, setChangeStatusToStreaming,
        confirmSettingsAccess, setConfirmSettingsAccess
    } = useWindowSettings();

    return (
        <div className="settings-content-inner">
            <div className="settings-section-header">
                <div>
                    <h2 className="settings-page-title">Режим стримера</h2>
                    <p className="settings-description">
                        Защитите свою конфиденциальность во время трансляций. Эти настройки помогут скрыть личные данные и уменьшить количество отвлекающих факторов.
                    </p>
                </div>
            </div>

            <div className={`streaming-status-info-row ${streamerModeEnabled ? 'active' : ''}`} style={{ marginBottom: '32px', background: streamerModeEnabled ? 'rgba(112, 0, 255, 0.15)' : 'rgba(255,255,255,0.03)' }}>
                <div className="streaming-status-content">
                    <div className={`status-dot ${streamerModeEnabled ? 'status-streaming' : 'status-offline'}`} />
                    <span style={{ fontWeight: 800, color: streamerModeEnabled ? 'var(--secondary-neon)' : 'var(--text-faint)' }}>
                        {streamerModeEnabled ? 'РЕЖИМ СТРИМЕРА ВКЛЮЧЕН' : 'РЕЖИМ СТРИМЕРА ВЫКЛЮЧЕН'}
                    </span>
                </div>
                {streamerModeEnabled && (
                    <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '8px' }}>
                        Все настройки защиты и приватности активны.
                    </p>
                )}
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Включить режим стримера</h3>
                        <p>Ручное управление режимом стримера.</p>
                    </div>
                    <SettingsToggle checked={streamerModeEnabled} onChange={setStreamerModeEnabled} />
                </div>
            </div>

            {streamerModeEnabled && (
                <div className="settings-card" style={{ marginTop: '16px' }}>
                    <div className="settings-row-text" style={{ marginBottom: '12px' }}>
                        <h3>Ссылка на стрим</h3>
                        <p>Если ссылка указана, в вашем профиле будет отображаться кнопка «Смотреть».</p>
                    </div>
                    <input 
                        type="text" 
                        className="settings-input" 
                        placeholder="https://twitch.tv/yourname" 
                        value={streamerLink}
                        onChange={(e) => setStreamerLink(e.target.value)}
                    />
                </div>
            )}

            <div className="settings-section-title">Автоматизация</div>
            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Автоматическое включение/выключение</h3>
                        <p>Включать режим стримера автоматически, если запущен OBS.</p>
                    </div>
                    <SettingsToggle checked={autoEnableWithOBS} onChange={setAutoEnableWithOBS} />
                </div>
            </div>

            <div className="settings-section-title">Защита данных</div>
            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Цензурить информацию на экране</h3>
                        <p>Скрывать уникальный никнейм, почту, заметки и основной сервер.</p>
                    </div>
                    <SettingsToggle checked={censorInfo} onChange={setCensorInfo} />
                </div>
                <div className="settings-sidebar-divider" style={{ margin: '16px 0' }} />
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Подтверждение открытия настроек</h3>
                        <p>Дополнительное подтверждение при переходе в разделы «Учётная запись», «Устройства», «Мои боты» и «Мини-приложения».</p>
                    </div>
                    <SettingsToggle checked={confirmSettingsAccess} onChange={setConfirmSettingsAccess} />
                </div>
            </div>

            <div className="settings-section-title">Уведомления и звуки</div>
            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Отключить все звуковые эффекты</h3>
                        <p>{brand.name.toUpperCase()} не будет воспроизводить звуки уведомлений, звонков и др.</p>
                    </div>
                    <SettingsToggle checked={disableSounds} onChange={setDisableSounds} />
                </div>
                <div className="settings-sidebar-divider" style={{ margin: '16px 0' }} />
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Отключить все уведомления</h3>
                        <p>Всплывающие уведомления на рабочем столе будут скрыты.</p>
                    </div>
                    <SettingsToggle checked={disableNotifications} onChange={setDisableNotifications} />
                </div>
            </div>

            <div className="settings-section-title">Профиль</div>
            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Изменить статус на «В эфире»</h3>
                        <p>Ваш статус будет автоматически меняться при включении режима стримера.</p>
                    </div>
                    <SettingsToggle checked={changeStatusToStreaming} onChange={setChangeStatusToStreaming} />
                </div>
            </div>
        </div>
    );
};

export default StreamerSettings;
