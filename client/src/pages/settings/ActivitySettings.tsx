import React, { useState, useEffect } from 'react';
import { useWindowSettings } from '../../contexts/WindowSettingsContext';
import { SettingsToggle } from './SettingsUI';
import { GamepadIcon, MusicIcon, VideoIcon, LayoutGridIcon, PlusIcon, CloseIcon } from '../../components/Icons';

interface ProcessItem {
    process: string;
    name: string;
    icon?: string | null;
}

const ActivitySettings: React.FC = () => {
    const { 
        activityDetectionEnabled, setActivityDetectionEnabled,
        userApps, setUserApps
    } = useWindowSettings();

    const [activeCategory, setActiveCategory] = useState('game');
    const [runningProcesses, setRunningProcesses] = useState<ProcessItem[]>([]);
    const [loadingProcesses, setLoadingProcesses] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [selectedApp, setSelectedApp] = useState<ProcessItem | null>(null);
    const [newAppProcess, setNewAppProcess] = useState('');
    const [newAppName, setNewAppName] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const categories = [
        { id: 'game', label: 'Игры', statusHint: 'играет в', icon: <GamepadIcon size={18} /> },
        { id: 'music', label: 'Музыка', statusHint: 'слушает в', icon: <MusicIcon size={18} /> },
        { id: 'video', label: 'Видео', statusHint: 'смотрит в', icon: <VideoIcon size={18} /> },
        { id: 'other', label: 'Другое', statusHint: 'использует', icon: <LayoutGridIcon size={18} /> }
    ];

    useEffect(() => {
        if (isAdding) {
            setLoadingProcesses(true);
            // @ts-ignore
            if (window.electron?.ipc) {
                // @ts-ignore
                window.electron.ipc.invoke('get-running-processes').then((procs: any) => {
                    if (Array.isArray(procs)) {
                        const formatted = procs.map(p => typeof p === 'string' ? { process: p, name: p.replace(/\.exe$/i, '') } : p);
                        setRunningProcesses(formatted);
                    }
                    setLoadingProcesses(false);
                }).catch(() => setLoadingProcesses(false));
            } else {
                setLoadingProcesses(false);
            }
        }
    }, [isAdding]);

    const handleSelectProcess = (p: ProcessItem) => {
        setSelectedApp(p);
        setNewAppProcess(p.process);
        setNewAppName(p.name);
        setIsDropdownOpen(false);
    };

    const handleAddApp = () => {
        if (newAppProcess && newAppName) {
            setUserApps({
                ...userApps,
                [newAppProcess]: { 
                    name: newAppName, 
                    type: activeCategory,
                    icon: selectedApp?.icon || null 
                }
            });
            setIsAdding(false);
            setSelectedApp(null);
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
            <div className="settings-card" style={{ padding: '0', position: 'relative' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', overflow: 'hidden' }}>
                    {categories.map(cat => (
                        <div 
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            style={{ 
                                flex: 1, 
                                padding: '12px 8px', 
                                textAlign: 'center', 
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                background: activeCategory === cat.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                                borderBottom: activeCategory === cat.id ? '2px solid var(--text-main)' : '2px solid transparent',
                                color: activeCategory === cat.id ? 'var(--text-main)' : 'var(--text-muted)',
                                transition: 'all 0.2s'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {cat.icon}
                                <span style={{ fontWeight: 600 }}>{cat.label}</span>
                            </div>
                            <span style={{ fontSize: '11px', opacity: 0.7 }}>«{cat.statusHint}»</span>
                        </div>
                    ))}
                </div>

                <div style={{ padding: '20px' }}>
                    {isAdding ? (
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', marginBottom: '16px', position: 'relative' }}>
                            <h4 style={{ marginBottom: '12px', color: 'var(--text-main)' }}>Добавление приложения</h4>
                            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', position: 'relative', zIndex: 50 }}>
                                {/* Custom Process Dropdown with Icons */}
                                <div style={{ flex: 1, position: 'relative' }}>
                                    <div 
                                        className="settings-input"
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '10px', 
                                            cursor: 'pointer',
                                            userSelect: 'none',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                                            {selectedApp?.icon ? (
                                                <img src={selectedApp.icon} alt="" style={{ width: '20px', height: '20px', borderRadius: '4px', objectFit: 'contain' }} />
                                            ) : (
                                                <span style={{ opacity: 0.5, flexShrink: 0, display: 'flex' }}><LayoutGridIcon size={18} /></span>
                                            )}
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {selectedApp ? `${selectedApp.name} (${selectedApp.process})` : loadingProcesses ? 'Загрузка приложений...' : 'Выберите запущенное приложение...'}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '10px', opacity: 0.6 }}>▼</span>
                                    </div>

                                    {isDropdownOpen && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            right: 0,
                                            marginTop: '6px',
                                            maxHeight: '240px',
                                            overflowY: 'auto',
                                            background: '#18191c',
                                            border: '1px solid var(--glass-border)',
                                            borderRadius: '8px',
                                            zIndex: 100,
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                                        }}>
                                            {runningProcesses.length === 0 ? (
                                                <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                                                    {loadingProcesses ? 'Сканирование процессов...' : 'Нет активных приложений'}
                                                </div>
                                            ) : (
                                                runningProcesses.map(p => (
                                                    <div
                                                        key={p.process}
                                                        onClick={() => handleSelectProcess(p)}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '10px',
                                                            padding: '10px 12px',
                                                            cursor: 'pointer',
                                                            background: selectedApp?.process === p.process ? 'rgba(255,255,255,0.08)' : 'transparent',
                                                            transition: 'background 0.15s'
                                                        }}
                                                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                                                        onMouseLeave={(e) => (e.currentTarget.style.background = selectedApp?.process === p.process ? 'rgba(255,255,255,0.08)' : 'transparent')}
                                                    >
                                                        {p.icon ? (
                                                            <img src={p.icon} alt="" style={{ width: '22px', height: '22px', borderRadius: '4px', objectFit: 'contain', flexShrink: 0 }} />
                                                        ) : (
                                                            <div style={{ width: '22px', height: '22px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                <span style={{ opacity: 0.5, display: 'flex' }}><LayoutGridIcon size={14} /></span>
                                                            </div>
                                                        )}
                                                        <div style={{ overflow: 'hidden' }}>
                                                            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {p.name}
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                                {p.process}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>

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
                                <button className="settings-btn secondary" onClick={() => { setIsAdding(false); setIsDropdownOpen(false); }}>Отмена</button>
                                <button className="settings-btn primary" onClick={handleAddApp} disabled={!newAppProcess || !newAppName}>Добавить</button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <p style={{ color: 'var(--text-muted)' }}>
                                Приложения в категории <strong>{categories.find(c => c.id === activeCategory)?.label}</strong> (статус: <em>«{categories.find(c => c.id === activeCategory)?.statusHint} [Название]»</em>):
                            </p>
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {app.icon ? (
                                            <img src={app.icon} alt="" style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'contain' }} />
                                        ) : (
                                            <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {categories.find(c => c.id === app.type)?.icon || <LayoutGridIcon size={16} />}
                                            </div>
                                        )}
                                        <div>
                                            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{app.name}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{process}</div>
                                        </div>
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
