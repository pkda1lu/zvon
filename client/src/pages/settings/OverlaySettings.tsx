import React from 'react';
import { useWindowSettings } from '../../contexts/WindowSettingsContext';
import { SettingsToggle, RangeSlider, ChoiceGroup } from './SettingsUI';

const OverlaySettings: React.FC = () => {
    const {
        overlayEnabled, setOverlayEnabled,
        overlayPosition, setOverlayPosition,
        overlayOpacity, setOverlayOpacity,
        overlaySize, setOverlaySize,
        overlayShowNames, setOverlayShowNames,
        overlayShowAvatars, setOverlayShowAvatars,
        overlayShowSpeakingRing, setOverlayShowSpeakingRing,
        overlayIdleOpacity, setOverlayIdleOpacity,
        overlayShowBackground, setOverlayShowBackground,
    } = useWindowSettings();

    const positionOptions = [
        { value: 'top-left', label: 'Слева вверху' },
        { value: 'top-right', label: 'Справа вверху' },
        { value: 'middle-left', label: 'Посередине слева' },
        { value: 'middle-right', label: 'Посередине справа' },
        { value: 'bottom-left', label: 'Слева внизу' },
        { value: 'bottom-right', label: 'Справа внизу' },
    ];

    const previewScale = 420 / 1280;

    return (
        <div className="settings-content-inner with-preview">
            <div className="settings-main-column">
                <h2 className="settings-page-title">Оверлей</h2>
                <p className="settings-description">
                    Отображение участников голосового канала поверх других окон. Полезно для игр и полноэкранных приложений.
                </p>

                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-row-text">
                            <h3>Включить внутриигровой оверлей</h3>
                            <p>Показывать список говорящих участников поверх игры.</p>
                        </div>
                        <SettingsToggle checked={overlayEnabled} onChange={setOverlayEnabled} />
                    </div>
                </div>

                <div className={`settings-group-fade ${!overlayEnabled ? 'disabled' : ''}`}>
                    <div className="settings-section-title">Расположение</div>
                    <div className="settings-card">
                        <ChoiceGroup 
                            options={positionOptions} 
                            value={overlayPosition} 
                            onChange={(val) => setOverlayPosition(val as any)} 
                            className="full-width"
                        />
                    </div>

                    <div className="settings-section-title">Внешний вид</div>
                    <div className="settings-card">
                        <div className="settings-row">
                            <div className="settings-row-text">
                                <h3>Прозрачность</h3>
                                <p>Общая прозрачность элементов оверлея.</p>
                            </div>
                            <RangeSlider 
                                min={0.1} 
                                max={1.0} 
                                step={0.1} 
                                value={overlayOpacity} 
                                onChange={setOverlayOpacity} 
                                unit="x" 
                            />
                        </div>
                        <div className="settings-sidebar-divider" style={{ margin: '16px 0' }} />
                        <div className="settings-row">
                            <div className="settings-row-text">
                                <h3>Размер</h3>
                                <p>Масштаб элементов оверлея.</p>
                            </div>
                            <RangeSlider 
                                min={0.5} 
                                max={2.0} 
                                step={0.1} 
                                value={overlaySize} 
                                onChange={setOverlaySize} 
                                unit="x" 
                            />
                        </div>
                        <div className="settings-sidebar-divider" style={{ margin: '16px 0' }} />
                        <div className="settings-row">
                            <div className="settings-row-text">
                                <h3>Прозрачность при бездействии</h3>
                                <p>Прозрачность, когда никто не говорит.</p>
                            </div>
                            <RangeSlider 
                                min={0.0} 
                                max={1.0} 
                                step={0.1} 
                                value={overlayIdleOpacity} 
                                onChange={setOverlayIdleOpacity} 
                                unit="x" 
                            />
                        </div>
                    </div>

                    <div className="settings-section-title">Детализация</div>
                    <div className="settings-card">
                        <div className="settings-row">
                            <div className="settings-row-text">
                                <h3>Показывать имена</h3>
                                <p>Отображать никнеймы участников.</p>
                            </div>
                            <SettingsToggle checked={overlayShowNames} onChange={setOverlayShowNames} />
                        </div>
                        <div className="settings-sidebar-divider" style={{ margin: '16px 0' }} />
                        <div className="settings-row">
                            <div className="settings-row-text">
                                <h3>Показывать аватары</h3>
                                <p>Отображать аватары участников.</p>
                            </div>
                            <SettingsToggle checked={overlayShowAvatars} onChange={setOverlayShowAvatars} />
                        </div>
                        <div className="settings-sidebar-divider" style={{ margin: '16px 0' }} />
                        <div className="settings-row">
                            <div className="settings-row-text">
                                <h3>Индикатор голоса</h3>
                                <p>Показывать светящееся кольцо при разговоре.</p>
                            </div>
                            <SettingsToggle checked={overlayShowSpeakingRing} onChange={setOverlayShowSpeakingRing} />
                        </div>
                        <div className="settings-sidebar-divider" style={{ margin: '16px 0' }} />
                        <div className="settings-row">
                            <div className="settings-row-text">
                                <h3>Тёмный фон</h3>
                                <p>Добавить полупрозрачную подложку под список.</p>
                            </div>
                            <SettingsToggle checked={overlayShowBackground} onChange={setOverlayShowBackground} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-preview-column interface-preview-col">
                <div className="appearance-preview-sticky">
                    <div className="preview-label">Предпросмотр оверлея</div>
                    <div className="interface-preview-scaling-container">
                        <div className="interface-preview-scaling-wrapper" style={{ 
                            transform: `scale(${previewScale})`,
                            transformOrigin: 'top left'
                        }}>
                            <div className="large-interface-preview liquid-glass-preview" style={{ 
                                width: '1280px', 
                                height: '720px', 
                                background: 'radial-gradient(circle at center, #1a1a2e 0%, #050510 100%)',
                                position: 'relative',
                                border: 'none'
                            }}>
                                <div 
                                    className={`overlay-mock ${overlayPosition} ${overlayShowBackground ? 'with-bg' : ''}`}
                                    style={{ 
                                        opacity: overlayOpacity,
                                        // middle → центрируем по вертикали (top:50% + сдвиг внутри transform).
                                        transform: overlayPosition.includes('middle')
                                            ? `translateY(-50%) scale(${overlaySize})`
                                            : `scale(${overlaySize})`,
                                        transformOrigin: `${overlayPosition.includes('top') ? 'top' : overlayPosition.includes('middle') ? 'center' : 'bottom'} ${overlayPosition.includes('left') ? 'left' : 'right'}`,
                                        position: 'absolute',
                                        zIndex: 10,
                                        margin: overlayPosition.includes('middle') ? '0 40px' : '40px',
                                        top: overlayPosition.includes('top') ? '0' : overlayPosition.includes('middle') ? '50%' : 'auto',
                                        bottom: overlayPosition.includes('bottom') ? '0' : 'auto',
                                        left: overlayPosition.includes('left') ? '0' : 'auto',
                                        right: overlayPosition.includes('right') ? '0' : 'auto'
                                    }}
                                >
                                    <div className={`overlay-user-item ${overlayShowSpeakingRing ? 'speaking' : ''}`}>
                                        {overlayShowAvatars && (
                                            <div className="overlay-avatar-wrapper">
                                                <div className="overlay-avatar-placeholder" style={{ background: 'var(--accent-primary)' }}>M</div>
                                                {overlayShowSpeakingRing && <div className="overlay-speaking-ring" />}
                                            </div>
                                        )}
                                        {overlayShowNames && <span className="overlay-username">MaxCord</span>}
                                    </div>
                                    <div className="overlay-user-item" style={{ opacity: overlayIdleOpacity }}>
                                        {overlayShowAvatars && (
                                            <div className="overlay-avatar-wrapper">
                                                <div className="overlay-avatar-placeholder">Z</div>
                                            </div>
                                        )}
                                        {overlayShowNames && <span className="overlay-username">ZvonUser</span>}
                                    </div>
                                    <div className="overlay-user-item" style={{ opacity: overlayIdleOpacity }}>
                                        {overlayShowAvatars && (
                                            <div className="overlay-avatar-wrapper">
                                                <div className="overlay-avatar-placeholder" style={{ background: '#7000ff' }}>A</div>
                                            </div>
                                        )}
                                        {overlayShowNames && <span className="overlay-username">Alex</span>}
                                    </div>
                                </div>

                                <div style={{ 
                                    position: 'absolute', 
                                    top: '50%', 
                                    left: '50%', 
                                    transform: 'translate(-50%, -50%)',
                                    width: '10px',
                                    height: '10px',
                                    border: '2px solid rgba(255,255,255,0.1)',
                                    borderRadius: '50%'
                                }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OverlaySettings;
