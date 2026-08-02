import React, { useState, useMemo } from 'react';
import { useAppearance, AppIconType, ThemeObject, CustomColors } from '../../contexts/AppearanceContext';
import { ChoiceGroup, GridPicker, RangeSlider, SettingsToggle } from './SettingsUI';
import { getIconBrand } from '../../utils/branding';
import { PlusIcon, TrashIcon, CheckIcon, GlobeIcon, LockIcon, BellIcon, PinIcon, UsersIcon, SmileIcon } from '../../components/Icons';
import InterfacePreview from '../../components/InterfacePreview';
import SettingsPreviewContainer from '../../components/SettingsPreviewContainer';

const ThemePreviewCard: React.FC<{ 
    theme: any, 
    isActive: boolean, 
    onApply: () => void,
    onDelete?: () => void,
    isAddCard?: boolean
}> = ({ theme, isActive, onApply, onDelete, isAddCard }) => {
    if (isAddCard) {
        return (
            <div className="theme-preview-card add-theme-card" onClick={onApply}>
                <div className="add-theme-content">
                    <PlusIcon size={24} />
                    <span>Создать свою</span>
                </div>
            </div>
        );
    }

    const { primary, secondary, accent } = theme.customColors;
    const baseClass = theme.theme === 'amoled' ? 'amoled-base' : 'dark-base';

    return (
        <div className={`theme-preview-card palette-type ${isActive ? 'active' : ''}`} onClick={onApply}>
            <div className={`theme-palette-preview ${baseClass}`}>
                <div className="palette-colors">
                    <div className="palette-color" style={{ background: primary }} />
                    <div className="palette-color" style={{ background: secondary }} />
                    <div className="palette-color" style={{ background: accent }} />
                </div>
                {isActive && <div className="mini-active-badge"><CheckIcon size={12} /></div>}
            </div>

            <div className="theme-info">
                <span className="theme-name">{theme.name}</span>
                {onDelete && (
                    <button className="theme-delete-btn" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                        <TrashIcon size={12} />
                    </button>
                )}
            </div>
        </div>
    );
};

const AppearanceSettings: React.FC = () => {
    const appearance = useAppearance();
    const { 
        theme, setTheme, 
        appIcon, setAppIcon,
        customColors, setCustomColors,
        customBackground, setCustomBackground,
        backgroundDim, setBackgroundDim,
        backgroundBlur, setBackgroundBlur,
        resetCustomTheme,
        
        savedThemes,
        activeThemeId,
        saveTheme,
        applyTheme,
        deleteTheme
    } = appearance;

    const [newThemeName, setNewThemeName] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);

    const brand = getIconBrand();
    const iconItems = brand.appIcons.map(icon => ({
        id: icon.id,
        label: icon.label,
        image: icon.img.startsWith('http') || icon.img.startsWith('/') ? icon.img : '/' + icon.img
    }));

    const handleSaveTheme = async () => {
        if (!newThemeName.trim()) return;
        await saveTheme(newThemeName, isPublic);
        setNewThemeName('');
        setShowSaveModal(false);
    };

    const defaultTheme = {
        name: 'Тёмная',
        theme: 'dark',
        customColors: { primary: '#006aff', secondary: '#7000ff', accent: '#ff00c8' },
        customBackground: '',
        backgroundDim: 40,
        backgroundBlur: 0,
        messageSpacing: 2,
        groupSpacing: 16,
        interfaceScale: 1.0,
        isPublic: true
    };

    const amoledTheme = {
        name: 'AMOLED',
        theme: 'amoled',
        customColors: { primary: '#006aff', secondary: '#7000ff', accent: '#ff00c8' },
        customBackground: '',
        backgroundDim: 40,
        backgroundBlur: 0,
        messageSpacing: 2,
        groupSpacing: 16,
        interfaceScale: 1.0,
        isPublic: true
    };

    const schemaOptions = [
        { value: 'dark', label: 'Тёмная' },
        { value: 'amoled', label: 'AMOLED' }
    ];

    // Scaling for preview
    const previewScale = 420 / 1280;

    return (
        <div className="settings-content-inner with-preview">
            <div className="settings-main-column">
                <h2 className="settings-page-title">Внешний вид</h2>
                
                <div className="settings-card themes-gallery-card">
                    <div className="settings-section-header">
                        <h3 className="settings-section-title" style={{marginTop: 0}}>Темы оформления</h3>
                    </div>

                    <div className="themes-horizontal-scroll">
                        <ThemePreviewCard 
                            theme={defaultTheme}
                            isActive={!activeThemeId && theme === 'dark'}
                            onApply={resetCustomTheme}
                        />
                        
                        <ThemePreviewCard 
                            theme={amoledTheme}
                            isActive={!activeThemeId && theme === 'amoled'}
                            onApply={() => setTheme('amoled')}
                        />

                        {savedThemes.map(t => (
                            <ThemePreviewCard 
                                key={t._id}
                                theme={t}
                                isActive={activeThemeId === t._id}
                                onApply={() => applyTheme(t)}
                                onDelete={() => deleteTheme(t._id!)}
                            />
                        ))}

                        <ThemePreviewCard 
                            isAddCard
                            theme={null}
                            isActive={false}
                            onApply={() => setShowSaveModal(true)}
                        />
                    </div>
                </div>

                {/* COLORS (Combined Schema and Tints) */}
                <div className="settings-card colors-combined-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>ЦВЕТА</h3>
                    
                    <div className="settings-row">
                        <div className="settings-row-text">
                            <h3>Схема</h3>
                            <p>Выберите базовый режим оформления интерфейса.</p>
                        </div>
                        <ChoiceGroup 
                            options={schemaOptions}
                            value={theme}
                            onChange={(val) => setTheme(val as any)}
                        />
                    </div>

                    <div className="settings-sidebar-divider" style={{margin: '20px 0'}} />

                    <h3 className="settings-section-title" style={{marginTop: 0}}>Оттенки</h3>
                    <p className="settings-description">Настройте основные и акцентные неоновые оттенки.</p>
                    <div className="color-inputs-grid">
                        <div className="color-input-item">
                            <label>Основной</label>
                            <input type="color" value={customColors.primary} onChange={(e) => setCustomColors({ primary: e.target.value })} />
                        </div>
                        <div className="color-input-item">
                            <label>Вторичный</label>
                            <input type="color" value={customColors.secondary} onChange={(e) => setCustomColors({ secondary: e.target.value })} />
                        </div>
                        <div className="color-input-item">
                            <label>Блик</label>
                            <input type="color" value={customColors.accent} onChange={(e) => setCustomColors({ accent: e.target.value })} />
                        </div>
                    </div>
                </div>

                <div className="settings-card background-full-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Фон приложения</h3>
                    <div className="bg-input-row">
                        <label className="settings-label">URL изображения</label>
                        <input 
                            type="text" 
                            className="settings-input" 
                            placeholder="https://example.com/image.png" 
                            value={customBackground}
                            onChange={(e) => setCustomBackground(e.target.value)}
                        />
                    </div>
                    {customBackground && (
                        <div className="bg-editor-horizontal">
                            <div className="settings-row">
                                <div className="settings-row-text">
                                    <h3>Яркость</h3>
                                </div>
                                <RangeSlider value={backgroundDim} min={0} max={100} unit="%" onChange={setBackgroundDim} />
                            </div>
                            <div className="settings-row">
                                <div className="settings-row-text">
                                    <h3>Размытие</h3>
                                </div>
                                <RangeSlider value={backgroundBlur} min={0} max={20} unit="px" onChange={setBackgroundBlur} />
                            </div>
                        </div>
                    )}
                </div>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Иконка приложения</h3>
                    <GridPicker 
                        items={iconItems}
                        selectedIds={[appIcon]}
                        onToggle={(id) => setAppIcon(id as AppIconType)}
                    />
                </div>
            </div>

            <SettingsPreviewContainer baseWidth={420} title="Предпросмотр интерфейса">
                <div className="interface-preview-scaling-container">
                    <InterfacePreview settings={appearance} scale={previewScale * (appearance.interfaceScale || 1)} />
                </div>
            </SettingsPreviewContainer>

            {showSaveModal && (
                <div className="settings-modal-overlay">
                    <div className="settings-modal-glass">
                        <h3>Сохранение темы</h3>
                        <p className="settings-description">Введите название для вашей новой темы.</p>
                        <input 
                            type="text" 
                            className="settings-input" 
                            placeholder="Название темы..." 
                            autoFocus
                            value={newThemeName}
                            onChange={(e) => setNewThemeName(e.target.value)}
                        />
                        <div className="settings-row" style={{marginTop: '15px'}}>
                            <span>Сделать публичной</span>
                            <SettingsToggle checked={isPublic} onChange={setIsPublic} />
                        </div>
                        <div className="modal-actions">
                            <button className="settings-btn secondary" onClick={() => setShowSaveModal(false)}>Отмена</button>
                            <button className="neon-btn" onClick={handleSaveTheme} disabled={!newThemeName.trim()}>Сохранить</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AppearanceSettings;
