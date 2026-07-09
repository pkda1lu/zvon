import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Server } from '../../types';
import { SettingsToggle } from '../settings/SettingsUI';

interface Props {
    server: Server;
    onServerUpdate: (updatedServer: Server) => void;
}

const UNITS = [
    { value: 60, label: 'минут' },
    { value: 3600, label: 'часов' },
    { value: 86400, label: 'дней' },
];

const decompose = (seconds: number): { amount: number; unit: number } => {
    for (const u of [...UNITS].reverse()) {
        if (seconds % u.value === 0 && seconds / u.value >= 1) return { amount: seconds / u.value, unit: u.value };
    }
    return { amount: Math.max(1, Math.round(seconds / 60)), unit: 60 };
};

const PrivacySettings: React.FC<Props> = ({ server, onServerUpdate }) => {
    const [showMembersList, setShowMembersList] = useState(server.showMembersList !== false);
    const initialSeconds = server.newcomerCooldownSeconds || 0;
    const initialDecomposed = decompose(initialSeconds || 600);
    const [cooldownEnabled, setCooldownEnabled] = useState(initialSeconds > 0);
    const [amount, setAmount] = useState(initialDecomposed.amount);
    const [unit, setUnit] = useState(initialDecomposed.unit);

    useEffect(() => {
        setShowMembersList(server.showMembersList !== false);
        const s = server.newcomerCooldownSeconds || 0;
        setCooldownEnabled(s > 0);
        const d = decompose(s || 600);
        setAmount(d.amount);
        setUnit(d.unit);
    }, [server._id]);

    const saveField = useCallback(async (field: string, value: any) => {
        try {
            const res = await axios.put(`/api/servers/${server._id}`, { [field]: value });
            onServerUpdate(res.data);
        } catch (e) {
            console.error(`Failed to save ${field}`, e);
        }
    }, [server._id, onServerUpdate]);

    const handleToggleCooldown = (enabled: boolean) => {
        setCooldownEnabled(enabled);
        if (enabled) {
            const a = amount || 10;
            setAmount(a);
            saveField('newcomerCooldownSeconds', a * unit);
        } else {
            saveField('newcomerCooldownSeconds', 0);
        }
    };

    const handleAmountChange = (value: number) => {
        const a = Math.max(1, value || 1);
        setAmount(a);
        if (cooldownEnabled) saveField('newcomerCooldownSeconds', a * unit);
    };

    const handleUnitChange = (value: number) => {
        setUnit(value);
        if (cooldownEnabled) saveField('newcomerCooldownSeconds', amount * value);
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Приватность</h2>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Отображение пользователей</h3>
                        <p>Показывать список участников и их активность справа от чата. Если выключено, область чата растягивается на всё пространство,
                            а клик по нику или аватару в сообщениях не открывает профиль.</p>
                    </div>
                    <SettingsToggle checked={showMembersList} onChange={(v) => { setShowMembersList(v); saveField('showMembersList', v); }} />
                </div>
            </div>

            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>«Охлаждение» новоприбывших</h3>
                        <p>Время с момента присоединения к серверу, в течение которого новый участник не может отправлять сообщения.</p>
                    </div>
                    <SettingsToggle checked={cooldownEnabled} onChange={handleToggleCooldown} />
                </div>
                {cooldownEnabled && (
                    <>
                        <div className="settings-sidebar-divider" style={{ margin: '20px 0' }} />
                        <div style={{ display: 'flex', gap: '10px', maxWidth: '320px' }}>
                            <input
                                type="number"
                                min={1}
                                className="settings-input"
                                style={{ flex: 1 }}
                                value={amount}
                                onChange={(e) => handleAmountChange(parseInt(e.target.value))}
                            />
                            <select className="settings-input" style={{ flex: 1 }} value={unit} onChange={(e) => handleUnitChange(parseInt(e.target.value))}>
                                {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                            </select>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default PrivacySettings;
