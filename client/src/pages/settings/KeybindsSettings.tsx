import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useKeybinds } from '../../contexts/KeybindsContext';
import { SettingsToggle, CustomSelect } from './SettingsUI';
import { CloseIcon, PlusIcon, KeyboardIcon, RotateCcwIcon } from '../../components/Icons';

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
        resetKeybinds,
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

    const actionOptions = useMemo(() => {
        const existingActions = new Set(keybinds.map(k => k.action));
        return Object.entries(ACTION_LABELS)
            .filter(([id]) => !existingActions.has(id))
            .map(([id, name]) => ({ id, name }));
    }, [keybinds]);

    const [newAction, setNewAction] = useState(() => actionOptions[0]?.id || 'toggle-mute');

    useEffect(() => {
        if (actionOptions.length > 0 && !actionOptions.some(opt => opt.id === newAction)) {
            setNewAction(actionOptions[0].id);
        }
    }, [actionOptions, newAction]);

    const formatAccelerator = (acc: string) => {
        if (acc === 'Нажмите, чтобы задать') return acc;
        return acc.split('+').map(part => {
            if (part === 'CommandOrControl') return 'Ctrl';
            return part;
        }).join(' + ');
    };

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!isRecording || !recordingId) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const modifiers = [];
        if (e.ctrlKey || e.metaKey) modifiers.push('CommandOrControl');
        if (e.shiftKey) modifiers.push('Shift');
        if (e.altKey) modifiers.push('Alt');

        let key = e.key.toUpperCase();
        if (key === ' ') key = 'Space';
        if (key === 'CONTROL' || key === 'SHIFT' || key === 'ALT' || key === 'META') return;
        
        if (key === 'ESCAPE') key = 'Escape';
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
            window.addEventListener('keydown', handleKeyDown, true);
            return () => window.removeEventListener('keydown', handleKeyDown, true);
        }
    }, [isRecording, handleKeyDown]);

    const acceleratorCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        keybinds.forEach(kb => {
            const acc = kb.accelerator.trim().toUpperCase();
            if (acc && acc !== 'НАЖМИТЕ, ЧТОБЫ ЗАДАТЬ') {
                counts[acc] = (counts[acc] || 0) + 1;
            }
        });
        return counts;
    }, [keybinds]);

    const groupedKeybinds = useMemo(() => {
        const groups: { action: string; items: typeof keybinds }[] = [];
        const map = new Map<string, typeof keybinds>();
        keybinds.forEach(kb => {
            if (!map.has(kb.action)) {
                const list: typeof keybinds = [];
                map.set(kb.action, list);
                groups.push({ action: kb.action, items: list });
            }
            map.get(kb.action)!.push(kb);
        });
        return groups;
    }, [keybinds]);

    return (
        <div className="settings-content-inner">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h2 className="settings-page-title" style={{ margin: 0 }}>Горячие клавиши</h2>
                <button 
                    className="settings-btn settings-btn-secondary"
                    onClick={resetKeybinds}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '10px', fontSize: '13px' }}
                    title="Сбросить все горячие клавиши к настройкам по умолчанию"
                >
                    <RotateCcwIcon size={16} />
                    Сбросить
                </button>
            </div>
            <p className="settings-description">
                Настройте глобальные клавиши для управления приложением, даже если оно находится в фоне.
            </p>
            
            <div className="settings-card">
                <h3 className="settings-section-title" style={{marginTop: 0}}>Добавить новое действие</h3>
                {actionOptions.length > 0 ? (
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
                ) : (
                    <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: 0 }}>
                        Все доступные действия уже добавлены в ваш список. Вы можете добавлять дополнительные комбинации клавиш к существующим действиям ниже.
                    </p>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {groupedKeybinds.length > 0 ? (
                    groupedKeybinds.map((group) => (
                        <div key={group.action} className="settings-card" style={{ padding: '20px', margin: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <div>
                                    <h3 style={{ fontSize: '16px', margin: '0 0 4px 0', color: 'var(--text-main)', fontWeight: 700 }}>
                                        {ACTION_LABELS[group.action] || group.action}
                                    </h3>
                                    <p style={{ fontSize: '13px', color: 'var(--text-dim)', margin: 0 }}>
                                        {group.items.length === 1 ? 'Глобальное сочетание клавиш' : `${group.items.length} сочетания клавиш`}
                                    </p>
                                </div>
                                <button
                                    className="settings-btn settings-btn-secondary"
                                    onClick={() => addKeybind(group.action, 'Нажмите, чтобы задать')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', fontSize: '12px' }}
                                    title="Добавить комбинацию"
                                >
                                    <PlusIcon size={14} />
                                    Добавить комбинацию
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {group.items.map((kb) => {
                                    const accUpper = kb.accelerator.trim().toUpperCase();
                                    const isDup = !!(accUpper && accUpper !== 'НАЖМИТЕ, ЧТОБЫ ЗАДАТЬ' && (acceleratorCounts[accUpper] || 0) > 1);
                                    const isRec = recordingId === kb.id;

                                    return (
                                        <div key={kb.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div 
                                                    className={`keybind-recorder ${isRec ? 'recording' : ''}`}
                                                    onClick={() => isRec ? stopRecording() : startRecording(kb.id)}
                                                    style={{
                                                        background: isRec 
                                                            ? 'rgba(0, 106, 255, 0.15)' 
                                                            : isDup 
                                                            ? 'rgba(255, 71, 87, 0.12)' 
                                                            : 'rgba(0,0,0,0.2)',
                                                        border: isRec 
                                                            ? '1.5px solid var(--primary-neon)' 
                                                            : isDup 
                                                            ? '1.5px solid #ff4757' 
                                                            : '1px solid var(--glass-border)',
                                                        padding: '8px 16px',
                                                        borderRadius: '10px',
                                                        color: isRec 
                                                            ? 'var(--primary-neon)' 
                                                            : isDup 
                                                            ? '#ff6b81' 
                                                            : 'var(--text-main)',
                                                        fontSize: '13px',
                                                        fontWeight: '700',
                                                        minWidth: '150px',
                                                        textAlign: 'center',
                                                        cursor: 'pointer',
                                                        fontFamily: 'monospace',
                                                        transition: 'all 0.2s ease',
                                                        boxShadow: isRec 
                                                            ? '0 0 10px rgba(0, 106, 255, 0.3)' 
                                                            : isDup 
                                                            ? '0 0 10px rgba(255, 71, 87, 0.3)' 
                                                            : 'none'
                                                    }}
                                                    title={isDup ? "Комбинация уже используется" : undefined}
                                                >
                                                    {isRec ? 'Нажмите клавиши...' : formatAccelerator(kb.accelerator)}
                                                </div>
                                                {isDup && (
                                                    <span style={{ fontSize: '11px', color: '#ff6b81', fontWeight: 600 }}>
                                                        Дубликат
                                                    </span>
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '12px', color: kb.isEnabled ? 'var(--text-dim)' : 'var(--text-faint)' }}>
                                                        {kb.isEnabled ? 'Включено' : 'Отключено'}
                                                    </span>
                                                    <SettingsToggle 
                                                        checked={kb.isEnabled} 
                                                        onChange={(val) => updateKeybind(kb.id, { isEnabled: val })} 
                                                    />
                                                </div>

                                                <button 
                                                    className="settings-btn settings-btn-danger"
                                                    onClick={() => removeKeybind(kb.id)}
                                                    style={{
                                                        padding: '8px',
                                                        borderRadius: '10px',
                                                        minWidth: 'auto'
                                                    }}
                                                    title="Удалить комбинацию"
                                                >
                                                    <CloseIcon size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '60px 0', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed var(--glass-border)' }}>
                        <span style={{ display: 'inline-block', opacity: 0.2, marginBottom: '16px' }}>
                            <KeyboardIcon size={48} />
                        </span>
                        <p>У вас нет настроенных горячих клавиш.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default KeybindsSettings;
