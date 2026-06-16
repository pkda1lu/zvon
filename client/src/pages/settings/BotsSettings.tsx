import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useDialog } from '../../contexts/DialogContext';
import { getAvatarUrl, getFullUrl } from '../../utils/avatar';

const BotsSettings: React.FC = () => {
    const [bots, setBots] = useState<any[]>([]);
    const [userServers, setUserServers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    
    const [botName, setBotName] = useState('');
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [revealedTokenId, setRevealedTokenId] = useState<string | null>(null);
    const [showServerSelect, setShowServerSelect] = useState<string | null>(null);

    const [editingBot, setEditingBot] = useState<any | null>(null);
    const [editName, setEditName] = useState('');
    const [editBio, setEditBio] = useState('');

    const [editAvatar, setEditAvatar] = useState<File | null>(null);
    const [editBanner, setEditBanner] = useState<File | null>(null);
    const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
    const [previewBanner, setPreviewBanner] = useState<string | null>(null);

    const avatarInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    const { confirm, alert } = useDialog();

    const fetchBots = async () => {
        try {
            const response = await axios.get('/api/bots/my');
            setBots(response.data);
        } catch (e) { }
    };

    const fetchUserServers = async () => {
        try {
            const response = await axios.get('/api/servers/me');
            setUserServers(response.data);
        } catch (e) { }
    };

    useEffect(() => {
        fetchBots();
        fetchUserServers();
    }, []);

    const createBot = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!botName.trim()) return;
        setLoading(true);
        try {
            await axios.post('/api/bots/create', { name: botName });
            setBotName('');
            fetchBots();
        } catch (e) {
            await alert('Ошибка создания бота');
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (bot: any) => {
        setEditingBot(bot);
        setEditName(bot.username);
        setEditBio(bot.bio || '');
        setEditAvatar(null);
        setEditBanner(null);
        setPreviewAvatar(bot.avatar ? getFullUrl(bot.avatar) : null);
        setPreviewBanner(bot.banner ? getFullUrl(bot.banner) : null);
    };

    const saveEdit = async () => {
        if (!editingBot) return;
        setLoading(true);
        try {
            await axios.patch(`/api/bots/${editingBot._id}`, { username: editName, bio: editBio });
            if (editAvatar) {
                const fd = new FormData();
                fd.append('avatar', editAvatar);
                await axios.post(`/api/bots/${editingBot._id}/avatar`, fd);
            }
            if (editBanner) {
                const fd = new FormData();
                fd.append('banner', editBanner);
                await axios.post(`/api/bots/${editingBot._id}/banner`, fd);
            }
            setEditingBot(null);
            fetchBots();
        } catch (e) {
            await alert('Ошибка при сохранении профиля');
        } finally {
            setLoading(false);
        }
    };

    const togglePublishBot = async (id: string) => {
        try {
            const res = await axios.patch(`/api/bots/${id}/publish`);
            await alert(res.data.message);
            fetchBots();
        } catch (e) {
            await alert('Ошибка публикации бота');
        }
    };

    const deleteBot = async (id: string) => {
        if (!(await confirm('Вы уверены, что хотите удалить этого бота?'))) return;
        try {
            await axios.delete(`/api/bots/${id}`);
            if (editingApp?._id === id) setEditingApp(null);
            fetchBots();
        } catch (e) { }
    };

    const copyToken = async (token: string) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(token)
                .then(() => {
                    setCopiedToken(token);
                    setTimeout(() => setCopiedToken(null), 2000);
                })
                .catch(async err => {
                    await alert("Копирование не удалось.");
                });
        }
    };

    const addBotToServer = async (botId: string, serverId: string) => {
        try {
            await axios.post(`/api/bots/${botId}/add-to-server`, { serverId });
            await alert('Бот успешно добавлен на сервер!');
            setShowServerSelect(null);
        } catch (e: any) {
            await alert(e.response?.data?.message || 'Ошибка при добавлении бота');
        }
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
                <h2 className="settings-page-title">Мои боты</h2>
                <p className="settings-description">
                    Создавайте ботов для автоматизации или интеграций. Боты работают через WebSocket API.
                </p>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Создать нового бота</h3>
                    <form onSubmit={createBot} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="Имя нового бота..."
                            value={botName}
                            onChange={e => setBotName(e.target.value)}
                            className="settings-input"
                            style={{ flex: '1 1 200px' }}
                        />
                        <button type="submit" className="settings-btn" disabled={loading}>
                            Создать
                        </button>
                    </form>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {bots.length === 0 && <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>У вас пока нет созданных ботов.</div>}
                    
                    {bots.map(bot => (
                        <div key={bot._id} className="settings-card" style={{ margin: 0, padding: 0, overflow: 'hidden' }}>
                            <div style={{ 
                                height: '100px', 
                                backgroundColor: 'var(--primary-neon)',
                                backgroundImage: bot.banner ? `url(${getFullUrl(bot.banner)})` : 'none',
                                backgroundSize: 'cover',
                                backgroundPosition: 'center'
                            }} />
                            <div style={{ padding: '0 24px 24px', position: 'relative' }}>
                                <div style={{ 
                                    width: '72px', height: '72px', borderRadius: '16px', 
                                    backgroundColor: '#1e1f22', border: '4px solid var(--glass-bg)',
                                    marginTop: '-36px',
                                    backgroundImage: bot.avatar ? `url(${getFullUrl(bot.avatar)})` : 'none',
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '24px', fontWeight: 'bold'
                                }}>
                                    {!bot.avatar && bot.username[0].toUpperCase()}
                                </div>
                                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                                    <div>
                                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text-main)' }}>{bot.username}</div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-dim)', marginTop: '4px' }}>ID: {bot._id}</div>
                                        
                                        <div style={{ marginTop: '16px' }}>
                                            <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '4px' }}>TOKEN</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input 
                                                    className="settings-input" 
                                                    type={revealedTokenId === bot._id ? 'text' : 'password'} 
                                                    value={bot.botToken} 
                                                    readOnly 
                                                    style={{ width: '250px', padding: '8px 12px', fontSize: '13px' }}
                                                />
                                                <button className="settings-btn" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={() => setRevealedTokenId(revealedTokenId === bot._id ? null : bot._id)}>
                                                    {revealedTokenId === bot._id ? 'Скрыть' : 'Показать'}
                                                </button>
                                                <button className="settings-btn" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', color: 'white' }} onClick={() => copyToken(bot.botToken)}>
                                                    {copiedToken === bot.botToken ? 'Скопировано!' : 'Копировать'}
                                                </button>
                                            </div>
                                        </div>

                                        {showServerSelect === bot._id && (
                                            <div style={{ marginTop: '16px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '12px' }}>
                                                <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '8px' }}>ВЫБЕРИТЕ СЕРВЕР</div>
                                                <select className="settings-select" style={{ width: '100%', marginBottom: '8px' }} onChange={(e) => {
                                                    if (e.target.value) addBotToServer(bot._id, e.target.value);
                                                }}>
                                                    <option value="">Выберите сервер...</option>
                                                    {userServers.map(s => (
                                                        <option key={s._id} value={s._id}>{s.name}</option>
                                                    ))}
                                                </select>
                                                <button className="settings-btn settings-btn-danger" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setShowServerSelect(null)}>Отмена</button>
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                        <button className="settings-btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)' }} onClick={() => startEdit(bot)}>Настроить профиль</button>
                                        <button className="settings-btn" style={{ background: 'rgba(0,106,255,0.2)', color: 'var(--primary-neon)' }} onClick={() => setShowServerSelect(bot._id)}>Добавить на сервер</button>
                                        <button className="settings-btn" style={{ background: bot.isPublished ? 'rgba(255,59,48,0.1)' : 'rgba(35,165,89,0.1)', color: bot.isPublished ? 'var(--danger)' : 'var(--success)' }} onClick={() => togglePublishBot(bot._id)}>
                                            {bot.isPublished ? 'Снять с публикации' : 'Опубликовать'}
                                        </button>
                                        <button className="settings-btn settings-btn-danger" onClick={() => deleteBot(bot._id)}>Удалить</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {editingBot && (
                <div className="settings-preview-column">
                    <h3 className="settings-section-title" style={{marginTop: 0}}>Редактирование {editingBot.username}</h3>
                    
                    <div className="settings-card">
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '12px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Имя бота</label>
                            <input className="settings-input" value={editName} onChange={e => setEditName(e.target.value)} style={{ marginTop: '8px' }} />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '12px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>О себе</label>
                            <textarea className="settings-textarea" value={editBio} onChange={e => setEditBio(e.target.value)} style={{ marginTop: '8px' }} />
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
                            <button className="settings-btn settings-btn-danger" style={{ flex: 1 }} onClick={() => setEditingBot(null)}>Отмена</button>
                            <button className="settings-btn" style={{ flex: 1 }} onClick={saveEdit} disabled={loading}>Сохранить</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BotsSettings;
