import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useKeybinds } from '../../contexts/KeybindsContext';
import { SettingsToggle, CustomSelect } from './SettingsUI';
import { CloseIcon, PlusIcon, KeyboardIcon } from '../../components/Icons';

const ACTION_LABELS: Record<string, string> = {
    'toggle-mute': 'Включить/выключить микрофон',
    'toggle-deafen': 'Включить/выключить динамики',
    'toggle-overlay': 'Показать/скрыть оверлей',
    'server-next': 'Следующий сервер',
    'server-prev': 'Предыдущий сервер',
    'channel-next': 'Следующий канал',
    'channel-prev': 'Предыдущий канал',
    'mark-server-read': 'Отметить сервер прочитанным',
    'mark-chat-read': 'Отметить чат прочитанным',
    'open-notifications': 'Открыть уведомления',
    'scroll-up': 'Прокрутить чат вверх',
    'scroll-down': 'Прокрутить чат вниз',
    'edit-last': 'Редактировать последнее сообщение',
    'delete-last': 'Удалить последнее сообщение',
    'close-window': 'Закрыть окно',
    'minimize-to-tray': 'Свернуть в трей'
};

const KeybindsSettings: React.FC = () => {
    const { 
        keybinds, 
        addKeybind, 
        removeKeybind, 
        updateKeybind,
        isRecording: contextIsRecording,
        startRecording: contextStartRecording,
        stopRecording: contextStopRecording,
        recordingId: contextRecordingId
    } = useKeybinds();

    // Use local state if context doesn't provide it yet (fallback)
    const [localRecordingId, setLocalRecordingId] = useState<string | null>(null);
    const recordingId = contextRecordingId || localRecordingId;
    const isRecording = contextIsRecording || !!localRecordingId;

    const startRecording = (id: string) => {
        if (contextStartRecording) contextStartRecording(id);
        else setLocalRecordingId(id);
    };

    const stopRecording = () => {
        if (contextStopRecording) contextStopRecording();
        else setLocalRecordingId(null);
    };

    const [newAction, setNewAction] = useState('toggle-mute');

    const actionOptions = useMemo(() => Object.entries(ACTION_LABELS).map(([id, name]) => ({ id, name })), []);

    const formatAccelerator = (acc: string) => {
        if (acc === 'Нажмите, чтобы задать') return acc;
        return acc.split('+').map(part => {
            if (part === 'CommandOrControl') return 'Ctrl';
            return part;
        }).join(' + ');
    };

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!isRecording || !recordingId) return;

        if (e.key === 'Escape') {
            stopRecording();
            return;
        }

        e.preventDefault();
        const modifiers = [];
        if (e.ctrlKey || e.metaKey) modifiers.push('CommandOrControl');
        if (e.shiftKey) modifiers.push('Shift');
        if (e.altKey) modifiers.push('Alt');

        let key = e.key.toUpperCase();
        if (key === ' ') key = 'Space';
        if (key === 'CONTROL' || key === 'SHIFT' || key === 'ALT' || key === 'META') return;
        
        if (key === 'ARROWUP') key = 'Up';
        if (key === 'ARROWDOWN') key = 'Down';
        if (key === 'ARROWLEFT') key = 'Left';
        if (key === 'ARROWRIGHT') key = 'Right';
        if (key === 'BACKSPACE') key = 'Backspace';
        if (key === 'ENTER') key = 'Return';

        const accelerator = [...modifiers, key].join('+');
        updateKeybind(recordingId, { accelerator });
        stopRecording();
    }, [isRecording, recordingId, updateKeybind, stopRecording]);

    useEffect(() => {
        if (isRecording) {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [isRecording, handleKeyDown]);

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Горячие клавиши</h2>
            <p className="settings-description">
                Настройте глобальные клавиши для управления приложением, даже если оно находится в фоне.
            </p>
            
            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Добавить новую клавишу</h3>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                        <label className="settings-label" style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: 'var(--text-faint)' }}>Действие</label>
                        <CustomSelect 
                            options={actionOptions} 
                            value={newAction} 
                            onChange={setNewAction} 
                        />
                    </div>
                    <button 
                        className="settings-btn"
                        onClick={() => addKeybind(newAction, 'Нажмите, чтобы задать')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '44px' }}
                    >
                        <PlusIcon size={18} />
                        Добавить
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {keybinds.length > 0 ? (
                    keybinds.map((kb) => (
                        <div key={kb.id} className="settings-card" style={{ padding: '20px', margin: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ fontSize: '16px', margin: '0 0 4px 0', color: 'var(--text-main)' }}>
                                        {ACTION_LABELS[kb.action] || kb.action}
                                    </h3>
                                    <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: 0 }}>
                                        Глобальное сочетание клавиш
                                    </p>
                                </div>
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                    <div 
                                        className={`keybind-recorder ${recordingId === kb.id ? 'recording' : ''}`}
                                        onClick={() => recordingId === kb.id ? stopRecording() : startRecording(kb.id)}
                                        style={{
                                            background: recordingId === kb.id ? 'rgba(0, 106, 255, 0.15)' : 'rgba(0,0,0,0.2)',
                                            border: `1px solid ${recordingId === kb.id ? 'var(--primary-neon)' : 'var(--glass-border)'}`,
                                            padding: '10px 20px',
                                            borderRadius: '12px',
                                            color: recordingId === kb.id ? 'var(--primary-neon)' : 'var(--text-main)',
                                            fontSize: '14px',
                                            fontWeight: '700',
                                            minWidth: '160px',
                                            textAlign: 'center',
                                            cursor: 'pointer',
                                            fontFamily: 'monospace',
                                            transition: 'all 0.2s ease',
                                            boxShadow: recordingId === kb.id ? '0 0 10px rgba(0, 106, 255, 0.3)' : 'none'
                                        }}
                                    >
                                        {recordingId === kb.id ? 'Нажмите клавиши...' : formatAccelerator(kb.accelerator)}
                                    </div>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <SettingsToggle 
                                            checked={kb.isEnabled} 
                                            onChange={(val) => updateKeybind(kb.id, { isEnabled: val })} 
                                        />
                                        <button 
                                            className="settings-btn settings-btn-danger"
                                            onClick={() => removeKeybind(kb.id)}
                                            style={{
                                                padding: '10px',
                                                borderRadius: '12px',
                                                minWidth: 'auto'
                                            }}
                                        >
                                            <CloseIcon size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '60px 0', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed var(--glass-border)' }}>
                        <KeyboardIcon size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                        <p>У вас нет настроенных горячих клавиш.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default KeybindsSettings;
