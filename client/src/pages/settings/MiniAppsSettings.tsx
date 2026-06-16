import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useDialog } from '../../contexts/DialogContext';
import { getAvatarUrl, getFullUrl } from '../../utils/avatar';

const MiniAppsSettings: React.FC = () => {
    const [miniapps, setMiniapps] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    
    const [appName, setAppName] = useState('');
    const [appUrl, setAppUrl] = useState('');
    
    const [editingApp, setEditingApp] = useState<any | null>(null);
    const [editName, setEditName] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [editDesc, setEditDesc] = useState('');

    const [editAvatar, setEditAvatar] = useState<File | null>(null);
    const [editBanner, setEditBanner] = useState<File | null>(null);
    const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
    const [previewBanner, setPreviewBanner] = useState<string | null>(null);

    const avatarInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    const { confirm, alert } = useDialog();

    const fetchApps = async () => {
        try {
            const response = await axios.get('/api/miniapps/my');
            setMiniapps(response.data);
        } catch (e) { }
    };

    useEffect(() => {
        fetchApps();
    }, []);

    const createApp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!appName.trim() || !appUrl.trim()) return;
        setLoading(true);
        try {
            await axios.post('/api/miniapps/create', { name: appName, url: appUrl });
            setAppName('');
            setAppUrl('');
            fetchApps();
        } catch (e) {
            await alert('Ошибка создания мини-приложения');
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (app: any) => {
        setEditingApp(app);
        setEditName(app.name);
        setEditUrl(app.url);
        setEditDesc(app.description || '');
        setEditAvatar(null);
        setEditBanner(null);
        setPreviewAvatar(app.avatar ? getFullUrl(app.avatar) : null);
        setPreviewBanner(app.banner ? getFullUrl(app.banner) : null);
    };

    const saveEdit = async () => {
        if (!editingApp) return;
        setLoading(true);
        try {
            await axios.patch(`/api/miniapps/${editingApp._id}`, { name: editName, url: editUrl, description: editDesc });
            if (editAvatar) {
                const fd = new FormData();
                fd.append('avatar', editAvatar);
                await axios.post(`/api/miniapps/${editingApp._id}/avatar`, fd);
            }
            if (editBanner) {
                const fd = new FormData();
                fd.append('banner', editBanner);
                await axios.post(`/api/miniapps/${editingApp._id}/banner`, fd);
            }
            setEditingApp(null);
            fetchApps();
        } catch (e) {
            await alert('Ошибка при сохранении');
        } finally {
            setLoading(false);
        }
    };

    const resetBanner = async () => {
        if (!editingApp || !editingApp.banner) return;
        if (!(await confirm('Вы уверены, что хотите сбросить баннер?'))) return;
        try {
            await axios.delete(`/api/miniapps/${editingApp._id}/banner`);
            setPreviewBanner(null);
            setEditingApp({ ...editingApp, banner: null });
            fetchApps();
        } catch (e) {
            await alert('Ошибка при сбросе баннера');
        }
    };

    const togglePublish = async (id: string) => {
        try {
            const res = await axios.patch(`/api/miniapps/${id}/publish`);
            await alert(res.data.message);
            fetchApps();
        } catch (e) {
            await alert('Ошибка публикации');
        }
    };

    const deleteApp = async (id: string) => {
        if (!(await confirm('Вы уверены, что хотите удалить это приложение?'))) return;
        try {
            await axios.delete(`/api/miniapps/${id}`);
            if (editingApp?._id === id) setEditingApp(null);
            fetchApps();
        } catch (e) { }
    };

    const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setEditAvatar(file);
            setPreviewAvatar(URL.createObjectURL(file));
        }
    };

    const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setEditBanner(file);
            setPreviewBanner(URL.createObjectURL(file));
        }
    };

    return (
        <div className="settings-content-inner with-preview">
            <div className="settings-main-column">
                <h2 className="settings-page-title">Мои мини-приложения</h2>
                <p className="settings-description">
                    Создавайте и управляйте своими мини-приложениями.
                </p>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Создать новое приложение</h3>
                    <form onSubmit={createApp} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="Название..."
                            value={appName}
                            onChange={e => setAppName(e.target.value)}
                            className="settings-input"
                            style={{ flex: '1 1 150px' }}
                        />
                        <input
                            type="text"
                            placeholder="URL (https://...)"
                            value={appUrl}
                            onChange={e => setAppUrl(e.target.value)}
                            className="settings-input"
                            style={{ flex: '1 1 200px' }}
                        />
                        <button type="submit" className="settings-btn" disabled={loading}>
                            Создать
                        </button>
                    </form>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {miniapps.length === 0 && <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>У вас пока нет мини-приложений.</div>}
                    
                    {miniapps.map(app => (
                        <div key={app._id} className="settings-card" style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
                            <div style={{ 
                                height: '100px', 
                                backgroundColor: 'var(--primary-neon)',
                                backgroundImage: app.banner ? `url(${getFullUrl(app.banner)})` : 'none',
                                backgroundSize: 'cover',
                                backgroundPosition: 'center'
                            }} />
                            <div style={{ padding: '0 24px 24px', position: 'relative' }}>
                                <div style={{ 
                                    width: '72px', height: '72px', borderRadius: '16px', 
                                    backgroundColor: '#1e1f22', border: '4px solid var(--glass-bg)',
                                    marginTop: '-36px',
                                    backgroundImage: app.avatar ? `url(${getFullUrl(app.avatar)})` : 'none',
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '24px', fontWeight: 'bold'
                                }}>
                                    {!app.avatar && app.name[0].toUpperCase()}
                                </div>
                                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-main)' }}>{app.name}</div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginTop: '4px' }}>ID: {app._id}</div>
                                        {app.description && <div style={{ fontSize: '14px', color: 'var(--text-dim)', marginTop: '12px' }}>{app.description}</div>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="settings-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)' }} onClick={() => startEdit(app)}>Настроить</button>
                                        <button className="settings-btn" style={{ background: app.isPublished ? 'rgba(255,59,48,0.1)' : 'rgba(35,165,89,0.1)', color: app.isPublished ? 'var(--danger)' : 'var(--success)' }} onClick={() => togglePublish(app._id)}>
                                            {app.isPublished ? 'Снять с публикации' : 'Опубликовать'}
                                        </button>
                                        <button className="settings-btn settings-btn-danger" onClick={() => deleteApp(app._id)}>Удалить</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {editingApp && (
                <div className="settings-preview-column">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Редактирование {editingApp.name}</h3>
                    
                    <div className="settings-card">
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '12px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Название</label>
                            <input className="settings-input" value={editName} onChange={e => setEditName(e.target.value)} style={{ marginTop: '8px' }} />
                        </div>
                        
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '12px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>URL</label>
                            <input className="settings-input" value={editUrl} onChange={e => setEditUrl(e.target.value)} style={{ marginTop: '8px' }} />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '12px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Описание</label>
                            <textarea className="settings-textarea" value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ marginTop: '8px' }} />
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                            <button className="settings-btn" style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={() => avatarInputRef.current?.click()}>
                                Выбрать аватар
                            </button>
                            <button className="settings-btn" style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={() => bannerInputRef.current?.click()}>
                                Выбрать баннер
                            </button>
                        </div>
                        
                        <input type="file" ref={avatarInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleAvatarSelect} />
                        <input type="file" ref={bannerInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleBannerSelect} />

                        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                            <button className="settings-btn settings-btn-danger" style={{ flex: 1 }} onClick={() => setEditingApp(null)}>Отмена</button>
                            <button className="settings-btn" style={{ flex: 1 }} onClick={saveEdit} disabled={loading}>Сохранить</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MiniAppsSettings;
