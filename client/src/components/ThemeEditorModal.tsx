import React, { useLayoutEffect, useState, useRef } from 'react';
import axios from 'axios';
import { ThemeObject, ThemeType, CustomColors } from '../contexts/AppearanceContext';
import { RangeSlider, ChoiceGroup } from '../pages/settings/SettingsUI';
import InterfacePreview from './InterfacePreview';
import './ThemeEditorModal.css';
import Modal from './Modal';

/**
 * Окно создания и правки темы.
 *
 * Ключевое отличие от прежнего порядка: оформление правится в ЧЕРНОВИКЕ, а не
 * в живых настройках приложения. Раньше цвета и фон менялись сразу и всерьёз,
 * поэтому «системная» тёмная тема на деле ничем не была защищена — выбрал её,
 * поменял цвет, и от исходной ничего не осталось. Здесь же до нажатия
 * «Сохранить» ничего не применяется, и системные темы остаются нетронутыми:
 * их можно взять за основу, но не изменить.
 *
 * Предпросмотр показывает именно черновик, а не текущее оформление приложения.
 */

export interface ThemeDraft {
    name: string;
    theme: ThemeType;
    customColors: CustomColors;
    customBackground: string;
    backgroundDim: number;
    backgroundBlur: number;
    messageSpacing: number;
    groupSpacing: number;
    interfaceScale: number;
}

interface ThemeEditorModalProps {
    /** Начальные значения — текущее оформление либо тема, взятая за основу. */
    initial: ThemeDraft;
    /** Правим существующую тему (иначе создаём новую). */
    existing?: ThemeObject | null;
    /** Имя темы-основы — показывается подсказкой при создании. */
    baseName?: string;
    onClose: () => void;
    /**
     * publish=true — сохранить и отправить на проверку.
     * Возвращает промис: пока он не завершится, кнопки заблокированы.
     */
    onSave: (draft: ThemeDraft, publish: boolean) => Promise<void>;
}

const ThemeEditorModal: React.FC<ThemeEditorModalProps> = ({
    initial, existing, baseName, onClose, onSave,
}) => {
    const [draft, setDraft] = useState<ThemeDraft>(initial);
    const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
    const [error, setError] = useState('');
    const previewRef = useRef<HTMLDivElement>(null);
    const [previewScale, setPreviewScale] = useState(0);

    useLayoutEffect(() => {
        const preview = previewRef.current;
        if (!preview) return;
        const fitPreview = () => setPreviewScale(preview.clientWidth / 1280);
        const observer = new ResizeObserver(fitPreview);
        observer.observe(preview);
        fitPreview();
        return () => observer.disconnect();
    }, []);

    const bgFileRef = useRef<HTMLInputElement>(null);
    const [bgUploading, setBgUploading] = useState(false);

    const patch = (p: Partial<ThemeDraft>) => setDraft(d => ({ ...d, ...p }));

    const handleBackgroundFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Сбрасываем поле: иначе повторный выбор того же файла не вызовет
        // событие, и человек решит, что кнопка сломалась.
        e.target.value = '';
        if (!file) return;

        setError('');
        setBgUploading(true);
        try {
            const form = new FormData();
            form.append('background', file);
            const token = localStorage.getItem('token');
            const res = await axios.post('/api/themes/background', form, {
                headers: { Authorization: `Bearer ${token}` },
            });
            patch({ customBackground: res.data.url });
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Не удалось загрузить файл.');
        } finally {
            setBgUploading(false);
        }
    };

    const submit = async (publish: boolean) => {
        if (!draft.name.trim()) { setError('Введите название темы.'); return; }
        setError('');
        setBusy(publish ? 'publish' : 'save');
        try {
            await onSave({ ...draft, name: draft.name.trim() }, publish);
            onClose();
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Не удалось сохранить тему.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <Modal
            open
            className="theme-editor"
            overlayClassName="theme-editor-overlay"
            title={existing ? 'Правка темы' : 'Новая тема'}
            subtitle={!existing && baseName ? `За основу взята «${baseName}»` : undefined}
            onClose={() => { if (!busy) onClose(); }}
            showCloseButton={!busy}
            footer={
                <>
                    <button type="button" className="settings-btn secondary" onClick={onClose} disabled={!!busy}>
                        Отмена
                    </button>
                    <button type="button" className="settings-btn secondary" onClick={() => submit(false)} disabled={!!busy}>
                        {busy === 'save' ? 'Сохраняем…' : 'Сохранить'}
                    </button>
                    <button type="button" className="neon-btn" onClick={() => submit(true)} disabled={!!busy}>
                        {busy === 'publish' ? 'Отправляем…' : 'Опубликовать'}
                    </button>
                </>
            }
        >
            <div className="theme-editor-body">
                <div className="theme-editor-form">
                    <label className="settings-label">Название</label>
                    <input
                        type="text"
                        className="settings-input"
                        placeholder="Например: Ночная синева"
                        autoFocus
                        maxLength={32}
                        value={draft.name}
                        onChange={e => patch({ name: e.target.value })}
                    />

                    <label className="settings-label">Основа</label>
                    <ChoiceGroup
                        options={[
                            { value: 'dark', label: 'Тёмная' },
                            { value: 'amoled', label: 'AMOLED' },
                        ]}
                        value={draft.theme}
                        onChange={(v: string) => patch({ theme: v as ThemeType })}
                    />

                    <label className="settings-label">Цвета</label>
                    <div className="theme-editor-colors">
                        {([
                            ['primary', 'Основной'],
                            ['secondary', 'Вторичный'],
                            ['accent', 'Блик'],
                        ] as const).map(([key, label]) => (
                            <div key={key} className="color-input-item">
                                <label>{label}</label>
                                <input
                                    type="color"
                                    value={draft.customColors[key]}
                                    onChange={e => patch({
                                        customColors: { ...draft.customColors, [key]: e.target.value },
                                    })}
                                />
                            </div>
                        ))}
                    </div>

                    <label className="settings-label">Фон</label>
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
                        {draft.customBackground && (
                            <button
                                type="button"
                                className="settings-btn secondary"
                                onClick={() => patch({ customBackground: '' })}
                            >
                                Убрать
                            </button>
                        )}
                    </div>
                    <input
                        type="text"
                        className="settings-input"
                        placeholder="или ссылка на изображение"
                        value={draft.customBackground}
                        onChange={e => patch({ customBackground: e.target.value })}
                    />
                    <p className="settings-hint">
                        PNG, JPG, WebP или GIF — анимированные тоже подходят.
                    </p>

                    {/* Затемнение и размытие имеют смысл только при фоне. */}
                    {draft.customBackground && (
                        <>
                            <label className="settings-label">Затемнение фона</label>
                            <RangeSlider value={draft.backgroundDim} min={0} max={100} unit="%"
                                onChange={(v: number) => patch({ backgroundDim: v })} />

                            <label className="settings-label">Размытие фона</label>
                            <RangeSlider value={draft.backgroundBlur} min={0} max={20} unit="px"
                                onChange={(v: number) => patch({ backgroundBlur: v })} />
                        </>
                    )}

                    <label className="settings-label">Отступ между сообщениями</label>
                    <RangeSlider value={draft.messageSpacing} min={0} max={24} unit="px"
                        onChange={(v: number) => patch({ messageSpacing: v })} />

                    <label className="settings-label">Отступ между группами</label>
                    <RangeSlider value={draft.groupSpacing} min={0} max={48} unit="px"
                        onChange={(v: number) => patch({ groupSpacing: v })} />
                </div>

                <div className="theme-editor-preview">
                    <div className="theme-editor-preview-frame" ref={previewRef}>
                        <InterfacePreview settings={draft} scale={previewScale} />
                    </div>
                </div>
            </div>

            {error && <div className="settings-error" role="alert">{error}</div>}
            <p className="theme-editor-note">
                «Сохранить» оставит тему только у вас. «Опубликовать» отправит её на
                проверку модератору — в общий список она попадёт после одобрения.
            </p>
        </Modal>
    );
};

export default ThemeEditorModal;
