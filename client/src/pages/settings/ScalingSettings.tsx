import React, { useState, useEffect, useRef } from 'react';
import { useAppearance, PageScales } from '../../contexts/AppearanceContext';
import { RangeSlider, ChoiceGroup } from './SettingsUI';

const ScalingSettings: React.FC = () => {
    const { interfaceScale, setInterfaceScale, pageScales, setPageScales } = useAppearance();

    // Scaling mode: 'global' | 'separate'
    const [scaleMode, setScaleMode] = useState<'global' | 'separate'>('global');

    // Global scale stored as percentage integer (e.g. 100 for 1.0)
    const [globalPercent, setGlobalPercent] = useState(() => Math.round(interfaceScale * 100));

    // Per-page scales stored as percentage integers
    const [localPages, setLocalPages] = useState<Record<keyof PageScales, number>>(() => ({
        sidebar: Math.round((pageScales?.sidebar ?? interfaceScale) * 100),
        chat: Math.round((pageScales?.chat ?? interfaceScale) * 100),
        members: Math.round((pageScales?.members ?? interfaceScale) * 100),
        settings: Math.round((pageScales?.settings ?? interfaceScale) * 100),
    }));

    const setInterfaceScaleRef = useRef(setInterfaceScale);
    const setPageScalesRef = useRef(setPageScales);
    const scaleModeRef = useRef(scaleMode);
    const globalPercentRef = useRef(globalPercent);
    const localPagesRef = useRef(localPages);

    useEffect(() => {
        setInterfaceScaleRef.current = setInterfaceScale;
        setPageScalesRef.current = setPageScales;
    }, [setInterfaceScale, setPageScales]);

    useEffect(() => {
        scaleModeRef.current = scaleMode;
        globalPercentRef.current = globalPercent;
        localPagesRef.current = localPages;
    }, [scaleMode, globalPercent, localPages]);

    const handleGlobalChange = (newVal: number) => {
        const clamped = Math.min(150, Math.max(70, Math.round(newVal)));
        setGlobalPercent(clamped);
    };

    const handlePageChange = (key: keyof PageScales, newVal: number) => {
        const clamped = Math.min(150, Math.max(70, Math.round(newVal)));
        setLocalPages(prev => ({ ...prev, [key]: clamped }));
    };

    // When switching mode, sync values so current settings match mode selection
    const handleModeChange = (mode: string) => {
        const newMode = mode as 'global' | 'separate';
        setScaleMode(newMode);

        if (newMode === 'global') {
            // Apply current globalPercent to all separate sliders
            setLocalPages({
                sidebar: globalPercent,
                chat: globalPercent,
                members: globalPercent,
                settings: globalPercent
            });
        }
    };

    // Commit settings when unmounting (leaving tab or closing settings)
    useEffect(() => {
        return () => {
            const currentMode = scaleModeRef.current;
            const globalFactor = globalPercentRef.current / 100;
            setInterfaceScaleRef.current(globalFactor);

            if (currentMode === 'global') {
                setPageScalesRef.current({
                    sidebar: globalFactor,
                    chat: globalFactor,
                    members: globalFactor,
                    settings: globalFactor,
                });
            } else {
                const pages = localPagesRef.current;
                setPageScalesRef.current({
                    sidebar: (pages.sidebar ?? globalPercentRef.current) / 100,
                    chat: (pages.chat ?? globalPercentRef.current) / 100,
                    members: (pages.members ?? globalPercentRef.current) / 100,
                    settings: (pages.settings ?? globalPercentRef.current) / 100,
                });
            }
        };
    }, []);

    const modeOptions = [
        { value: 'global', label: 'Общий масштаб' },
        { value: 'separate', label: 'Раздельное масштабирование' }
    ];

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Масштабирование</h2>
            <p className="settings-description">
                Изменяйте масштабирование интерфейса как удобно: всё сразу или раздельно
            </p>
            
            <div className="settings-card" style={{ marginBottom: '24px' }}>
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Режим масштабирования</h3>
                        <p>Укажите, как вы хотите настроить пропорции интерфейса.</p>
                    </div>
                    <ChoiceGroup 
                        options={modeOptions}
                        value={scaleMode}
                        onChange={handleModeChange}
                    />
                </div>
            </div>

            {scaleMode === 'global' ? (
                <div className="settings-section">
                    <h3 className="settings-section-title">Общий масштаб</h3>
                    <div className="settings-card">
                        <div className="settings-row">
                            <div className="settings-row-text">
                                <h3>Интерфейс всего приложения</h3>
                                <p>Базовый размер шрифтов и элементов управления (от 70% до 150%).</p>
                            </div>
                            <RangeSlider 
                                value={globalPercent} 
                                min={70} 
                                max={150} 
                                step={1} 
                                unit="%" 
                                showInput={true}
                                inputMin={70}
                                inputMax={150}
                                onChange={handleGlobalChange} 
                            />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="settings-section">
                    <h3 className="settings-section-title">Раздельное масштабирование разделов</h3>
                    <div className="settings-card">
                        <div className="settings-row">
                            <div className="settings-row-text">
                                <h3>Боковая панель каналов</h3>
                                <p>Размер списка серверов, каналов и профиля пользователя.</p>
                            </div>
                            <RangeSlider 
                                value={localPages.sidebar ?? globalPercent} 
                                min={70} 
                                max={150} 
                                step={1} 
                                unit="%" 
                                showInput={true}
                                inputMin={70}
                                inputMax={150}
                                onChange={(val) => handlePageChange('sidebar', val)} 
                            />
                        </div>

                        <div className="settings-sidebar-divider" style={{ margin: '16px 0' }} />

                        <div className="settings-row">
                            <div className="settings-row-text">
                                <h3>Область чата</h3>
                                <p>Размер сообщений, аватаров и текстового ввода в чате.</p>
                            </div>
                            <RangeSlider 
                                value={localPages.chat ?? globalPercent} 
                                min={70} 
                                max={150} 
                                step={1} 
                                unit="%" 
                                showInput={true}
                                inputMin={70}
                                inputMax={150}
                                onChange={(val) => handlePageChange('chat', val)} 
                            />
                        </div>

                        <div className="settings-sidebar-divider" style={{ margin: '16px 0' }} />

                        <div className="settings-row">
                            <div className="settings-row-text">
                                <h3>Список участников</h3>
                                <p>Размер списка участников сервера в правой колонке.</p>
                            </div>
                            <RangeSlider 
                                value={localPages.members ?? globalPercent} 
                                min={70} 
                                max={150} 
                                step={1} 
                                unit="%" 
                                showInput={true}
                                inputMin={70}
                                inputMax={150}
                                onChange={(val) => handlePageChange('members', val)} 
                            />
                        </div>

                        <div className="settings-sidebar-divider" style={{ margin: '16px 0' }} />

                        <div className="settings-row">
                            <div className="settings-row-text">
                                <h3>Экран настроек</h3>
                                <p>Размер боковой панели настроек и рабочей области параметров.</p>
                            </div>
                            <RangeSlider 
                                value={localPages.settings ?? globalPercent} 
                                min={70} 
                                max={150} 
                                step={1} 
                                unit="%" 
                                showInput={true}
                                inputMin={70}
                                inputMax={150}
                                onChange={(val) => handlePageChange('settings', val)} 
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="settings-info-box">
                <p>Масштабирование интерфейса можно в любой момент отрегулировать. Обычный размер интерфейса по умолчанию составляет 100%.</p>
            </div>
        </div>
    );
};

export default ScalingSettings;
