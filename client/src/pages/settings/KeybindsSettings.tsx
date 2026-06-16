import React, { useState, useEffect, useCallback } from 'react';
import { useKeybinds } from '../../contexts/KeybindsContext';
import { SettingsToggle, CustomSelect } from './SettingsUI';
import { CloseIcon, PlusIcon } from '../../components/Icons';

const KeybindsSettings: React.FC = () => {
    const { keybinds, updateKeybind, removeKeybind, addKeybind } = useKeybinds();
    const [recordingId, setRecordingId] = useState<string | null>(null);
    const [newActionType, setNewActionType] = useState<string>('toggle-mute');

    const formatAccelerator = (acc: string) => {
        return acc.split('+').map(part => {
            if (part === 'CommandOrControl') return 'Ctrl';
            return part;
        }).join(' + ');
    };

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!recordingId) return;

        if (e.key === 'Escape') {
            setRecordingId(null);
            return;
        }
        e.preventDefault();

        const modifiers = [];
        if (e.ctrlKey || e.metaKey) modifiers.push('CommandOrControl');
        if (e.shiftKey) modifiers.push('Shift');
        if (e.altKey) modifiers.push('Alt');

        const isModifier = ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key);
        if (!isModifier) {
            let key = e.key.toUpperCase();
            if (key === ' ') key = 'Space';
            if (key === 'ARROWUP') key = 'Up';
            if (key === 'ARROWDOWN') key = 'Down';
            if (key === 'ARROWLEFT') key = 'Left';
            if (key === 'ARROWRIGHT') key = 'Right';
            
            const accelerator = [...modifiers, key].join('+');
            updateKeybind(recordingId, { accelerator });
            setRecordingId(null);
        }
    }, [recordingId, updateKeybind]);

    useEffect(() => {
        if (recordingId) {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [recordingId, handleKeyDown]);

    const getActionLabel = (action: string) => {
        switch (action) {
            case 'toggle-mute': return 'Включить/выключить микрофон';
            case 'toggle-deafen': return 'Включить/выключить звук';
            case 'toggle-overlay': return 'Показать/скрыть оверлей';
            case 'push-to-talk': return 'Режим рации (PTT)';
            default: return action;
        }
    };

    const actionOptions = [
        { id: 'toggle-mute', name: 'Включить/выключить микрофон' },
        { id: 'toggle-deafen', name: 'Включить/выключить звук' },
        { id: 'toggle-overlay', name: 'Показать/скрыть оверлей' },
        { id: 'push-to-talk', name: 'Режим рации (PTT)' }
    ];

    const handleAdd = () => {
        addKeybind(newActionType, 'Ctrl+Shift+K'); // Default temporary placeholder
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Горячие клавиши</h2>
            <p className="settings-description">
                Настройте глобальные клавиши для управления приложением, даже если оно находится в фоне.
            </p>

            <div className="settings-card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                        <CustomSelect 
                            options={actionOptions} 
                            value={newActionType} 
                            onChange={setNewActionType} 
                            placeholder="Выберите действие"
                        />
                    </div>
                    <button className="settings-btn" onClick={handleAdd} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <PlusIcon size={18} /> Добавить
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {keybinds.map(kb => (
                    <div key={kb.id} className="settings-card" style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-main)' }}>
                                {getActionLabel(kb.action)}
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginTop: '4px' }}>
                                Глобальная клавиша
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div
                                onClick={() => setRecordingId(kb.id)}
                                style={{
                                    background: recordingId === kb.id ? 'rgba(0, 106, 255, 0.15)' : 'rgba(0, 0, 0, 0.2)',
                                    border: `1px solid ${recordingId === kb.id ? 'var(--primary-neon)' : 'var(--glass-border)'}`,
                                    padding: '10px 20px',
                                    borderRadius: '12px',
                                    minWidth: '160px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 700,
                                    color: recordingId === kb.id ? 'var(--primary-neon)' : 'var(--text-main)',
                                    transition: 'all 0.2s ease',
                                    boxShadow: recordingId === kb.id ? '0 0 10px rgba(0, 106, 255, 0.3)' : 'none'
                                }}
                            >
                                {recordingId === kb.id ? 'Нажмите клавиши...' : formatAccelerator(kb.accelerator)}
                            </div>

                            <SettingsToggle 
                                checked={kb.isEnabled} 
                                onChange={(val) => updateKeybind(kb.id, { isEnabled: val })} 
                            />

                            <button
                                className="settings-btn settings-btn-danger"
                                style={{ padding: '10px', borderRadius: '12px' }}
                                onClick={() => removeKeybind(kb.id)}
                            >
                                <CloseIcon size={18} />
                            </button>
                        </div>
                    </div>
                ))}

                {keybinds.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px 0' }}>
                        У вас нет настроенных горячих клавиш.
                    </div>
                )}
            </div>
        </div>
    );
};

export default KeybindsSettings;
