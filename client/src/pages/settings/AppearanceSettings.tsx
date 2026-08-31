import React, { useState, useMemo } from 'react';
import axios from 'axios';
import { useAppearance, AppIconType, ThemeObject, CustomColors } from '../../contexts/AppearanceContext';
import { ChoiceGroup, GridPicker, RangeSlider } from './SettingsUI';
import { getIconBrand } from '../../utils/branding';
import { PlusIcon, TrashIcon, CheckIcon, LockIcon, BellIcon, PinIcon, UsersIcon, SmileIcon, EditIcon } from '../../components/Icons';
import InterfacePreview from '../../components/InterfacePreview';
import SettingsPreviewContainer from '../../components/SettingsPreviewContainer';
import ThemeEditorModal, { ThemeDraft } from '../../components/ThemeEditorModal';

/** Состояние проверки — подпись и цвет метки на карточке своей темы. */
const MODERATION_BADGE: Record<string, { label: string; cls: string }> = {
    pending: { label: 'На проверке', cls: 'pending' },
    approved: { label: 'Опубликована', cls: 'approved' },
    rejected: { label: 'Отклонена', cls: 'rejected' },
};

const ThemePreviewCard: React.FC<{ 
    theme: any, 
    isActive: boolean, 
    onApply: () => void,
    onDelete?: () => void,
    isAddCard?: boolean,
    /** Системная тема: менять нельзя, можно взять за основу. */
    isSystem?: boolean,
    onUseAsBase?: () => void,
    onEdit?: () => void,
    /** Показать метку проверки и кнопку публикации (только для своих тем). */
    showModeration?: boolean,
    onTogglePublish?: () => void,
    /** Автор — подписывается у чужих тем в общем списке. */
    authorName?: string,
}> = ({ theme, isActive, onApply, onDelete, isAddCard, isSystem, onUseAsBase, onEdit, showModeration, onTogglePublish, authorName }) => {
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
    const badge = theme.moderationStatus ? MODERATION_BADGE[theme.moderationStatus] : null;

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
                {/* Замок у системной темы: сразу видно, что менять её нельзя. */}
                {isSystem && <LockIcon size={12} className="theme-lock" />}
                {onEdit && (
                    <button className="theme-edit-btn" title="Изменить тему" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                        <EditIcon size={12} />
                    </button>
                )}
                {onDelete && (
                    <button className="theme-delete-btn" title="Удалить тему" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                        <TrashIcon size={12} />
                    </button>
                )}
            </div>

            {/* Чужую и системную тему не правят — с них начинают свою. */}
            {onUseAsBase && (
                <div className="theme-moderation">
                    <button className="theme-publish-btn" onClick={(e) => { e.stopPropagation(); onUseAsBase(); }}>
                        Взять за основу
                    </button>
                </div>
            )}

            {authorName && <div className="theme-author">{authorName}</div>}

            {showModeration && (
                <div className="theme-moderation">
                    {badge && <span className={`theme-badge ${badge.cls}`}>{badge.label}</span>}
                    {/* Отклонённую тему можно отправить снова — причина
                        подсказывает, что поправить. */}
                    {theme.moderationReason && theme.moderationStatus === 'rejected' && (
                        <span className="theme-reject-reason" title={theme.moderationReason}>
                            {theme.moderationReason}
                        </span>
                    )}
                    {onTogglePublish && !theme.isBlocked && (
                        <button
                            className="theme-publish-btn"
                            onClick={(e) => { e.stopPropagation(); onTogglePublish(); }}
                        >
                            {theme.moderationStatus === 'pending' || theme.isPublished
                                ? 'Снять с публикации'
                                : 'Опубликовать'}
                        </button>
                    )}
                    {theme.isBlocked && <span className="theme-badge rejected">Заблокирована</span>}
                </div>
            )}
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
        saveThemeDraft,
        applyTheme,
        deleteTheme,
        publicThemes,
        isLoadingPublic,
        fetchPublicThemes,
        setThemePublished
    } = appearance;


    /*
     * Общий список тем. Загружаем при первом показе вкладки и при изменении
     * поиска, с задержкой — иначе запрос уходил бы на каждую букву.
     */
    const [themeQuery, setThemeQuery] = useState('');
    React.useEffect(() => {
        const t = setTimeout(() => { fetchPublicThemes(themeQuery.trim() || undefined); }, themeQuery ? 300 : 0);
        return () => clearTimeout(t);
    }, [themeQuery, fetchPublicThemes]);

    const handleTogglePublish = async (t: ThemeObject) => {
        const isOut = t.moderationStatus === 'pending' || t.isPublished;
        try {
            await setThemePublished(t._id!, !isOut);
        } catch { /* сообщение уже записано в консоль контекстом */ }
    };

    // Загрузка фона с устройства
    const bgFileRef = React.useRef<HTMLInputElement>(null);
    const [bgUploading, setBgUploading] = useState(false);
    const [bgError, setBgError] = useState('');

    const handleBackgroundFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Сбрасываем значение поля: иначе повторный выбор того же файла
        // не вызовет событие, и человек решит, что кнопка сломалась.
        e.target.value = '';
        if (!file) return;

        setBgError('');
        setBgUploading(true);
        try {
            const form = new FormData();
            form.append('background', file);
            const token = localStorage.getItem('token');
            const res = await axios.post('/api/themes/background', form, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCustomBackground(res.data.url);
        } catch (err: any) {
            setBgError(err?.response?.data?.message || 'Не удалось загрузить файл.');
        } finally {
            setBgUploading(false);
        }
    };

    const brand = getIconBrand();
    const iconItems = brand.appIcons.map(icon => ({
        id: icon.id,
        label: icon.label,
        image: icon.img.startsWith('http') || icon.img.startsWith('/') ? icon.img : '/' + icon.img
    }));

    /*
     * Окно правки темы. Держим в состоянии сам черновик и то, правим ли мы
     * существующую тему — иначе после закрытия окна непонятно, куда сохранять.
     */
    const [editor, setEditor] = useState<{
        draft: ThemeDraft;
        existing: ThemeObject | null;
        baseName?: string;
    } | null>(null);

    /** Собрать черновик из темы (или из текущего оформления). */
    const draftFrom = (src: any, name: string): ThemeDraft => ({
        name,
        theme: src.theme,
        customColors: { ...src.customColors },
        customBackground: src.customBackground || '',
        backgroundDim: src.backgroundDim ?? 40,
        backgroundBlur: src.backgroundBlur ?? 0,
        messageSpacing: src.messageSpacing ?? 2,
        groupSpacing: src.groupSpacing ?? 16,
        interfaceScale: src.interfaceScale ?? 1,
    });

    /*
     * Своя тема выбрана или системная. Раньше цвета и фон правились всегда,
     * из-за чего системная тема менялась «на месте»: выбрал тёмную, поменял
     * цвет — и от исходной ничего не осталось, хотя в списке она значилась
     * прежней. Теперь при системной теме правка закрыта, а вместо неё
     * предлагается создать свою на её основе.
     */
    const editingOwnTheme = !!activeThemeId;

    const openNewTheme = (base: any, baseName: string) =>
        setEditor({ draft: draftFrom(base, ''), existing: null, baseName });

    const openEditTheme = (t: ThemeObject) =>
        setEditor({ draft: draftFrom(t, t.name), existing: t });

    const handleEditorSave = async (draft: ThemeDraft, publish: boolean) => {
        await saveThemeDraft(draft as any, publish, editor?.existing?._id);
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
                        {/* Системные темы: применить можно, изменить — нет.
                            «Взять за основу» открывает редактор с их значениями. */}
                        <ThemePreviewCard 
                            theme={defaultTheme}
                            isActive={!activeThemeId && theme === 'dark'}
                            onApply={resetCustomTheme}
                            isSystem
                            onUseAsBase={() => openNewTheme(defaultTheme, defaultTheme.name)}
                        />
                        
                        <ThemePreviewCard 
                            theme={amoledTheme}
                            isActive={!activeThemeId && theme === 'amoled'}
                            onApply={() => setTheme('amoled')}
                            isSystem
                            onUseAsBase={() => openNewTheme(amoledTheme, amoledTheme.name)}
                        />

                        {savedThemes.map(t => (
                            <ThemePreviewCard 
                                key={t._id}
                                theme={t}
                                isActive={activeThemeId === t._id}
                                onApply={() => applyTheme(t)}
                                onDelete={() => deleteTheme(t._id!)}
                                onEdit={() => openEditTheme(t)}
                                showModeration
                                onTogglePublish={() => handleTogglePublish(t)}
                            />
                        ))}

                        <ThemePreviewCard 
                            isAddCard
                            theme={null}
                            isActive={false}
                            onApply={() => openNewTheme(appearance, '')}
                        />
                    </div>
                </div>

                {/*
                    Общие темы. Раньше галочка «Сделать публичной» при сохранении
                    была, но публичные темы не показывались нигде — то есть
                    поделиться темой было нельзя, а галочка ничего не меняла.
                */}
                <div className="settings-card">
                    <div className="themes-gallery-head">
                        <h3 className="settings-section-title" style={{ marginTop: 0 }}>Общие темы</h3>
                        <input
                            type="text"
                            className="settings-input themes-search"
                            placeholder="Поиск по названию…"
                            value={themeQuery}
                            onChange={(e) => setThemeQuery(e.target.value)}
                        />
                    </div>
                    <p className="settings-description">
                        Темы, которые опубликовали другие. В список попадают только прошедшие проверку.
                    </p>

                    {isLoadingPublic ? (
                        <div className="themes-empty">Загрузка…</div>
                    ) : publicThemes.length === 0 ? (
                        <div className="themes-empty">
                            {themeQuery ? 'Ничего не нашлось.' : 'Пока никто не опубликовал тему.'}
                        </div>
                    ) : (
                        <div className="theme-preview-grid">
                            {publicThemes.map(t => (
                                <ThemePreviewCard
                                    key={t._id}
                                    theme={t}
                                    isActive={activeThemeId === t._id}
                                    onApply={() => applyTheme(t)}
                                    authorName={typeof t.creator === 'object' && t.creator
                                        ? ((t.creator as any).displayName || (t.creator as any).username)
                                        : undefined}
                                    onUseAsBase={() => openNewTheme(t, t.name)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* COLORS (Combined Schema and Tints) */}
                {/*
                    Правка оформления доступна только для своей темы. При
                    системной показываем, почему поля закрыты, и сразу даём
                    выход — создать свою на её основе.
                */}
                {!editingOwnTheme && (
                    <div className="settings-card theme-locked-card">
                        <div className="theme-locked-head">
                            <LockIcon size={16} />
                            <h3 className="settings-section-title" style={{ margin: 0 }}>
                                Системная тема — менять нельзя
                            </h3>
                        </div>
                        <p className="settings-description">
                            «Тёмная» и «AMOLED» одинаковы для всех. Чтобы настроить цвета,
                            фон и отступы, создайте свою тему — за основу возьмётся текущая.
                        </p>
                        <button
                            className="neon-btn"
                            onClick={() => openNewTheme(appearance, theme === 'amoled' ? 'AMOLED' : 'Тёмная')}
                        >
                            Создать свою на этой основе
                        </button>
                    </div>
                )}

                {editingOwnTheme && <div className="settings-card colors-combined-card">
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
                </div>}

                {editingOwnTheme && <div className="settings-card background-full-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Фон приложения</h3>

                    {/*
                        Два способа задать фон. Загрузка с устройства появилась
                        потому, что ссылка ненадёжна: картинку по чужому адресу
                        могут удалить, и фон пропадёт — а если тема опубликована,
                        то у всех, кто её применил.
                    */}
                    <div className="bg-source-row">
                        <button
                            type="button"
                            className="settings-btn secondary"
                            onClick={() => bgFileRef.current?.click()}
                            disabled={bgUploading}
                        >
                            {bgUploading ? 'Загрузка…' : 'Загрузить с устройства'}
                        </button>
                        <input
                            ref={bgFileRef}
                            type="file"
                            accept="image/png,image/jpeg,image/gif,image/webp"
                            hidden
                            onChange={handleBackgroundFile}
                        />
                        {customBackground && (
                            <button
                                type="button"
                                className="settings-btn secondary"
                                onClick={() => setCustomBackground('')}
                            >
                                Убрать фон
                            </button>
                        )}
                    </div>
                    <p className="settings-hint">
                        PNG, JPG, WebP или GIF — анимированные тоже подходят. До 100 МБ,
                        но лучше держаться в пределах нескольких мегабайт: файл грузится при
                        каждом запуске.
                    </p>
                    {bgError && <div className="settings-error">{bgError}</div>}

                    <div className="bg-input-row">
                        <label className="settings-label">или ссылка на изображение</label>
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
                </div>}

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

            {/* Прежнее окно спрашивало только название и галочку публикации,
                а оформление к тому моменту уже было применено ко всему
                приложению. Теперь всё наоборот: сначала собираем тему в
                черновике с предпросмотром, и лишь сохранение её применяет. */}
            {editor && (
                <ThemeEditorModal
                    initial={editor.draft}
                    existing={editor.existing}
                    baseName={editor.baseName}
                    onClose={() => setEditor(null)}
                    onSave={handleEditorSave}
                />
            )}

        </div>
    );
};

export default AppearanceSettings;
