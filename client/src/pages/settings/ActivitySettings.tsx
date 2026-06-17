import React, { useState, useEffect } from 'react';
import { useWindowSettings } from '../../contexts/WindowSettingsContext';
import { SettingsToggle } from './SettingsUI';
import { GamepadIcon, MusicIcon, VideoIcon, LayoutGridIcon, PlusIcon, CloseIcon } from '../../components/Icons';

const ActivitySettings: React.FC = () => {
    const { 
        activityDetectionEnabled, setActivityDetectionEnabled,
        userApps, setUserApps
    } = useWindowSettings();

    const [activeCategory, setActiveCategory] = useState('game');
    const [runningProcesses, setRunningProcesses] = useState<string[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [newAppProcess, setNewAppProcess] = useState('');
    const [newAppName, setNewAppName] = useState('');

    const categories = [
        { id: 'game', label: 'Игры', icon: <GamepadIcon size={18} /> },
        { id: 'music', label: 'Музыка', icon: <MusicIcon size={18} /> },
        { id: 'video', label: 'Видео', icon: <VideoIcon size={18} /> },
        { id: 'other', label: 'Другое', icon: <LayoutGridIcon size={18} /> }
    ];

    useEffect(() => {
        if (isAdding) {
            // @ts-ignore
            if (window.electron?.ipc) {
                // @ts-ignore
                window.electron.ipc.invoke('get-running-processes').then(setRunningProcesses);
            }
        }
    }, [isAdding]);

    const handleAddApp = () => {
        if (newAppProcess && newAppName) {
            setUserApps({
                ...userApps,
                [newAppProcess]: { name: newAppName, type: activeCategory }
            });
            setIsAdding(false);
            setNewAppProcess('');
            setNewAppName('');
        }
    };

    const handleRemoveApp = (processName: string) => {
        const newApps = { ...userApps };
        delete newApps[processName];
        setUserApps(newApps);
    };

    const currentCategoryApps = Object.entries(userApps || {}).filter(([_, app]) => app.type === activeCategory);

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Активность</h2>
            <p className="settings-description">
                Управляйте отображением вашей игровой и мультимедийной активности в профиле.
            </p>

            <div className="settings-section-title">Обнаружение</div>
            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Обнаружение активности</h3>
                        <p>Автоматически определять запущенные игры, музыку и видео для отображения в вашем профиле.</p>
                    </div>
                    <SettingsToggle checked={activityDetectionEnabled} onChange={setActivityDetectionEnabled} />
                </div>
            </div>

            <div className="settings-section-title">Категории и приложения</div>
            <div className="settings-card" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)' }}>
                    {categories.map(cat => (
                        <div 
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            style={{ 
                                flex: 1, 
                                padding: '12px', 
                                textAlign: 'center', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                background: activeCategory === cat.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                                borderBottom: activeCategory === cat.id ? '2px solid var(--text-main)' : '2px solid transparent',
                                color: activeCategory === cat.id ? 'var(--text-main)' : 'var(--text-muted)',
                                transition: 'all 0.2s'
                            }}
                        >
                            {cat.icon}
                            <span style={{ fontWeight: 600 }}>{cat.label}</span>
                        </div>
                    ))}
                </div>

                <div style={{ padding: '20px' }}>
                    {isAdding ? (
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
                            <h4 style={{ marginBottom: '12px', color: 'var(--text-main)' }}>Добавление приложения</h4>
                            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                                <select 
                                    className="settings-input" 
                                    style={{ flex: 1 }}
                                    value={newAppProcess}
                                    onChange={(e) => {
                                        setNewAppProcess(e.target.value);
                                        if (!newAppName) {
                                            setNewAppName(e.target.value.replace('.exe', ''));
                                        }
                                    }}
                                >
                                    <option value="" disabled>Выберите запущенный процесс...</option>
                                    {runningProcesses.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                                <input 
                                    type="text" 
                                    className="settings-input" 
                                    style={{ flex: 1 }}
                                    placeholder="Отображаемое название"
                                    value={newAppName}
                                    onChange={(e) => setNewAppName(e.target.value)}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button className="settings-btn secondary" onClick={() => setIsAdding(false)}>Отмена</button>
                                <button className="settings-btn primary" onClick={handleAddApp} disabled={!newAppProcess || !newAppName}>Добавить</button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <p style={{ color: 'var(--text-muted)' }}>Пользовательские приложения в этой категории:</p>
                            <button className="settings-btn secondary" onClick={() => setIsAdding(true)} style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <PlusIcon size={16} /> Добавить
                            </button>
                        </div>
                    )}

                    {currentCategoryApps.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.1)', borderRadius: '12px' }}>
                            Нет добавленных приложений.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {currentCategoryApps.map(([process, app]) => (
                                <div key={process} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{app.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{process}</div>
                                    </div>
                                    <button 
                                        style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}
                                        onClick={() => handleRemoveApp(process)}
                                        title="Удалить"
                                    >
                                        <CloseIcon size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="settings-section-title">История</div>
            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Статистика времени</h3>
                        <p>Показывать в профиле, сколько времени вы провели в каждом приложении.</p>
                    </div>
                    <SettingsToggle checked={true} onChange={() => {}} />
                </div>
            </div>
        </div>
    );
};

export default ActivitySettings;
