import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Server } from '../../types';
import { getAvatarUrl } from '../../utils/avatar';
import ImageCropper from '../../components/ImageCropper';
import { useDialog } from '../../contexts/DialogContext';
import { PlusIcon, TrashIcon } from '../../components/Icons';
import { ServerProfileCardBody } from '../../components/ServerProfileCard';
import SettingsPreviewContainer from '../../components/SettingsPreviewContainer';

interface Props {
    server: Server;
    onServerUpdate: (updatedServer: Server) => void;
}

interface ActivityOption {
    name: string;
    image: string | null;
    totalSeconds: number;
}

type FeaturedActivity = { name: string; image?: string | null };

const BANNER_COLORS = ['#5865f2', '#ed4245', '#3ba55d', '#faa61a', '#eb459e', '#7289da', '#23272a', '#000000'];

const ServerProfileSettings: React.FC<Props> = ({ server, onServerUpdate }) => {
    const { alert } = useDialog();
    const [name, setName] = useState(server.name);
    const [description, setDescription] = useState(server.description || '');
    const [bannerColor, setBannerColor] = useState(server.bannerColor || '#5865f2');
    const [features, setFeatures] = useState<string[]>(server.features || []);
    const [featuredActivities, setFeaturedActivities] = useState<FeaturedActivity[]>(server.featuredActivities || []);
    const [activityOptions, setActivityOptions] = useState<ActivityOption[]>([]);
    const [uploading, setUploading] = useState(false);

    const [cropModal, setCropModal] = useState<{ isOpen: boolean; image: string; type: 'icon' | 'banner' }>({ isOpen: false, image: '', type: 'icon' });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setName(server.name);
        setDescription(server.description || '');
        setBannerColor(server.bannerColor || '#5865f2');
        setFeatures(server.features || []);
        setFeaturedActivities(server.featuredActivities || []);
    }, [server._id]);

    useEffect(() => {
        axios.get(`/api/servers/${server._id}/top-activities`).then(res => setActivityOptions(res.data)).catch(() => {});
    }, [server._id]);

    const saveField = useCallback(async (field: string, value: any) => {
        try {
            const res = await axios.put(`/api/servers/${server._id}`, { [field]: value });
            onServerUpdate(res.data);
        } catch (e) {
            console.error(`Failed to auto-save ${field}`, e);
        }
    }, [server._id, onServerUpdate]);

    // Держим актуальные server/saveField в ref, чтобы дебаунс-эффекты не перезапускались при каждом обновлении сервера.
    const serverRef = useRef(server);
    useEffect(() => { serverRef.current = server; }, [server]);
    const saveFieldRef = useRef(saveField);
    useEffect(() => { saveFieldRef.current = saveField; }, [saveField]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (name.trim() && name !== serverRef.current.name) saveFieldRef.current('name', name);
        }, 1000);
        return () => clearTimeout(timer);
    }, [name]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (description !== (serverRef.current.description || '')) saveFieldRef.current('description', description);
        }, 1000);
        return () => clearTimeout(timer);
    }, [description]);

    // Особенности редактируются построчно — сохраняем весь массив с паузой после набора текста.
    useEffect(() => {
        const timer = setTimeout(() => {
            const clean = features.filter(f => f.trim());
            if (JSON.stringify(clean) !== JSON.stringify((serverRef.current.features || []))) {
                saveFieldRef.current('features', clean);
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [features]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'icon' | 'banner') => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setCropModal({ isOpen: true, image: reader.result as string, type });
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleCropComplete = async (croppedBlob: Blob) => {
        const type = cropModal.type;
        setCropModal(prev => ({ ...prev, isOpen: false }));
        const formData = new FormData();
        formData.append(type, croppedBlob, `${type}.jpg`);
        try {
            setUploading(true);
            const res = await axios.post(`/api/servers/${server._id}/${type}`, formData);
            onServerUpdate({ ...server, [type]: res.data[type] });
        } catch (err) {
            await alert(`Ошибка при загрузке ${type === 'icon' ? 'аватара' : 'баннера'}`);
        } finally {
            setUploading(false);
        }
    };

    const updateFeature = (i: number, value: string) => setFeatures(prev => prev.map((f, idx) => idx === i ? value : f));
    const addFeature = () => { if (features.length < 5) setFeatures(prev => [...prev, '']); };
    const removeFeature = (i: number) => {
        const updated = features.filter((_, idx) => idx !== i);
        setFeatures(updated);
        saveField('features', updated.filter(f => f.trim()));
    };

    const handleBannerColorChange = (c: string) => {
        setBannerColor(c);
        saveField('bannerColor', c);
    };

    const toggleActivity = (option: ActivityOption) => {
        setFeaturedActivities(prev => {
            const exists = prev.some(a => a.name === option.name);
            const updated = exists
                ? prev.filter(a => a.name !== option.name)
                : (prev.length >= 5 ? prev : [...prev, { name: option.name, image: option.image }]);
            saveField('featuredActivities', updated);
            return updated;
        });
    };

    return (
        <div className="settings-content-inner with-preview">
            <div className="settings-main-column">
                <h2 className="settings-page-title">Профиль сервера</h2>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{ marginTop: 0 }}>Визуал</h3>
                    <div className="settings-row">
                        <div className="settings-row-text">
                            <h3>Аватар</h3>
                            <p>Отображается в списке серверов и приглашениях. Рекомендуемый размер: 512x512.</p>
                        </div>
                        <div className="settings-btn-group">
                            <button className="settings-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>{server.icon ? 'Изменить' : 'Установить'}</button>
                        </div>
                    </div>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileSelect(e, 'icon')} />

                    <div className="settings-sidebar-divider" style={{ margin: '20px 0' }} />

                    <div className="settings-row">
                        <div className="settings-row-text">
                            <h3>Баннер</h3>
                            <p>Отображается в верхней части списка каналов. Рекомендуемый размер: 1920x640.</p>
                        </div>
                        <div className="settings-btn-group">
                            <button className="settings-btn" onClick={() => bannerInputRef.current?.click()} disabled={uploading}>{server.banner ? 'Изменить' : 'Установить'}</button>
                        </div>
                    </div>
                    <input type="file" ref={bannerInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => handleFileSelect(e, 'banner')} />

                    {!server.banner && (
                        <div className="banner-color-picker" style={{ marginTop: '15px' }}>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>Или выберите цвет:</p>
                            <div className="color-swatches">
                                {BANNER_COLORS.map(c => (
                                    <div key={c} className={`color-swatch ${bannerColor === c ? 'active' : ''}`} style={{ backgroundColor: c }} onClick={() => handleBannerColorChange(c)} />
                                ))}
                                <input type="color" className="color-input-custom" value={bannerColor} onChange={(e) => handleBannerColorChange(e.target.value)} />
                            </div>
                        </div>
                    )}
                </div>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{ marginTop: 0 }}>Название</h3>
                    <input
                        className={`settings-input ${!name.trim() ? 'error' : ''}`}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => { if (!name.trim()) setName(server.name); }}
                        maxLength={100}
                    />
                    {!name.trim() && (
                        <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '6px', fontWeight: 600 }}>
                            Название сервера не может быть пустым
                        </div>
                    )}
                </div>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{ marginTop: 0 }}>О сервере</h3>
                    <textarea className="settings-textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Расскажите, о чём этот сервер..." />
                </div>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{ marginTop: 0 }}>Фишки</h3>
                    <p className="settings-description">До 5 коротких пунктов о фишках сервера. Отображаются на карточке сервера и в приглашении.</p>
                    <div className="server-settings-tag-list">
                        {features.map((f, i) => (
                            <div key={i} className="server-settings-tag-row">
                                <input className="settings-input" value={f} onChange={(e) => updateFeature(i, e.target.value)} maxLength={50} placeholder={`Фишка ${i + 1}`} />
                                <button className="action-button danger" onClick={() => removeFeature(i)}><TrashIcon size={16} /></button>
                            </div>
                        ))}
                        {features.length < 5 && (
                            <button className="settings-btn secondary" style={{ alignSelf: 'flex-start' }} onClick={addFeature}><PlusIcon size={14} /> Добавить фишку</button>
                        )}
                    </div>
                </div>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{ marginTop: 0 }}>Активности</h3>
                    <p className="settings-description">До 5 любимых активностей сервера, выбранных среди активностей участников. Список отсортирован по суммарному времени игры.</p>
                    {activityOptions.length === 0 ? (
                        <div className="server-settings-empty-state">Участники сервера пока не играли ни во что.</div>
                    ) : (
                        <div className="settings-grid-picker">
                            {activityOptions.map(a => {
                                const active = featuredActivities.some(fa => fa.name === a.name);
                                return (
                                    <div key={a.name} className={`grid-picker-item ${active ? 'active' : ''}`} onClick={() => toggleActivity(a)}>
                                        {a.image ? <img src={getAvatarUrl(a.image)!} className="grid-picker-img" alt={a.name} /> : <div className="grid-picker-img" />}
                                        <div className="grid-picker-label">{a.name}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <SettingsPreviewContainer baseWidth={340} title="Предпросмотр">
                <div className="user-profile-card" style={{ width: '100%', position: 'relative' }}>
                    <ServerProfileCardBody
                        server={server}
                        overrides={{ name, description, icon: server.icon, banner: server.banner, bannerColor, features, featuredActivities }}
                    />
                </div>
            </SettingsPreviewContainer>

            {cropModal.isOpen && (
                <ImageCropper
                    image={cropModal.image}
                    cropShape="rect"
                    aspect={cropModal.type === 'icon' ? 1 : 1920 / 640}
                    title={cropModal.type === 'icon' ? 'Обрезка аватара' : 'Обрезка баннера'}
                    onCropComplete={handleCropComplete}
                    onCancel={() => setCropModal(prev => ({ ...prev, isOpen: false }))}
                />
            )}
        </div>
    );
};

export default ServerProfileSettings;
