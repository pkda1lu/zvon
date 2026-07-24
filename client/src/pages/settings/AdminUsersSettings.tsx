import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import UserAvatar from '../../components/UserAvatar';
import { getFullUrl } from '../../utils/avatar';
import { UsersIcon, LayoutGridIcon, ShieldIcon, PlusIcon } from '../../components/Icons';

const AdminUsersSettings: React.FC = () => {
    const { user: currentUser } = useAuth();
    const { confirm, prompt, alert } = useDialog();
    const [view, setView] = useState<'users' | 'servers'>('users');
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchData = async () => {
        setLoading(true);
        try {
            const endpoint = view === 'users' ? '/api/admin/users' : '/api/admin/servers';
            const res = await axios.get(`${endpoint}?search=${search}&page=${page}`);
            if (view === 'users') {
                setData(Array.isArray(res.data.users) ? res.data.users : []);
                setTotalPages(res.data.pages || 1);
            } else {
                setData(Array.isArray(res.data.servers) ? res.data.servers : []);
                setTotalPages(res.data.pages || 1);
            }
        } catch (err) {
            console.error('Fetch error:', err);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, [view, page]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchData();
    };

    const deleteUser = async (id: string, username: string) => {
        if (await confirm(`Вы уверены, что хотите УДАЛИТЬ аккаунт ${username}? Это действие необратимо.`)) {
            try {
                await axios.delete(`/api/admin/users/${id}`);
                fetchData();
                await alert('Пользователь удален.');
            } catch (e) { }
        }
    };

    const toggleBan = async (id: string, username: string, isCurrentlyBanned: boolean) => {
        const action = isCurrentlyBanned ? 'разблокировать' : 'ЗАБЛОКИРОВАТЬ';
        if (await confirm(`Вы уверены, что хотите ${action} пользователя ${username}?`)) {
            try {
                await axios.patch(`/api/admin/users/${id}`, { isBanned: !isCurrentlyBanned });
                fetchData();
                await alert(`Пользователь ${isCurrentlyBanned ? 'разблокирован' : 'заблокирован'}.`);
            } catch (e) { }
        }
    };

    const notifyOwner = async (userId: string | undefined, targetLabel: string) => {
        if (!userId) {
            await alert('У этого объекта нет владельца, которому можно отправить уведомление.');
            return;
        }
        const message = await prompt(`Сообщение от модерации для ${targetLabel}:`, '');
        if (!message || !message.trim()) return;
        try {
            await axios.post('/api/admin/notify', { userId, message: message.trim() });
            await alert('Уведомление отправлено.');
        } catch (e) {
            await alert('Не удалось отправить уведомление.');
        }
    };

    const deleteServer = async (id: string, name: string) => {
        if (await confirm(`Вы уверены, что хотите УДАЛИТЬ сервер "${name}"? Все каналы и сообщения будут стерты.`)) {
            try {
                await axios.delete(`/api/admin/servers/${id}`);
                fetchData();
                await alert('Сервер удален.');
            } catch (e) { }
        }
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Управление сообществом</h2>
            <p className="settings-description">Полный список пользователей и серверов с инструментами администрирования.</p>

            <div style={{ marginBottom: '24px', display: 'flex', gap: '10px', borderBottom: '1px solid var(--glass-border)' }}>
                <button
                    onClick={() => { setView('users'); setPage(1); }}
                    className={`settings-tab-btn ${view === 'users' ? 'active' : ''}`}
                    style={{
                        padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                        color: view === 'users' ? 'var(--primary-neon)' : 'var(--text-dim)',
                        fontWeight: 700, fontSize: '14px',
                        borderBottom: `2px solid ${view === 'users' ? 'var(--primary-neon)' : 'transparent'}`,
                        marginBottom: '-1px'
                    }}
                >
                    Пользователи
                </button>
                <button
                    onClick={() => { setView('servers'); setPage(1); }}
                    className={`settings-tab-btn ${view === 'servers' ? 'active' : ''}`}
                    style={{
                        padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                        color: view === 'servers' ? 'var(--primary-neon)' : 'var(--text-dim)',
                        fontWeight: 700, fontSize: '14px',
                        borderBottom: `2px solid ${view === 'servers' ? 'var(--primary-neon)' : 'transparent'}`,
                        marginBottom: '-1px'
                    }}
                >
                    Сервера
                </button>
            </div>

            <form onSubmit={handleSearch} style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
                <input 
                    type="text" 
                    className="auth-input-glass" 
                    placeholder={`Поиск ${view === 'users' ? 'пользователей' : 'серверов'}...`}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ flex: 1 }}
                />
                <button type="submit" className="settings-btn" style={{ padding: '0 20px' }}>Поиск</button>
            </form>

            <div className="settings-list">
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>Загрузка...</div>
                ) : data.length === 0 ? (
                    <div className="server-settings-empty-state">Ничего не найдено.</div>
                ) : (
                    data.map(item => (
                        <div key={item._id} className="settings-list-row">
                            {view === 'users' ? (
                                <div className="settings-list-row-icon round"><UserAvatar user={item} size={40} /></div>
                            ) : (
                                <div className="settings-list-row-icon">
                                    {item.icon ? (
                                        <img src={getFullUrl(item.icon)!} alt="" />
                                    ) : (item.name?.[0]?.toUpperCase() || '#')}
                                </div>
                            )}

                            <div className="settings-list-row-body">
                                {view === 'users' ? (
                                    <>
                                        <div className="settings-list-row-title">
                                            {item.username}
                                            {item.role === 'admin' && <span className="settings-list-row-tag" style={{ background: 'var(--accent-pink)' }}>ADMIN</span>}
                                            {item.role === 'moderator' && <span className="settings-list-row-tag" style={{ background: 'var(--primary-neon)' }}>MOD</span>}
                                            {item.isBanned && <span className="settings-list-row-tag" style={{ background: 'var(--danger)' }}>BANNED</span>}
                                        </div>
                                        <div className="settings-list-row-meta">{item.email}</div>
                                    </>
                                ) : (
                                    <>
                                        <div className="settings-list-row-title">{item.name}</div>
                                        <div className="settings-list-row-meta">Владелец: {item.owner?.username || 'System'} • {item.members?.length || 0} уч.</div>
                                    </>
                                )}
                            </div>

                            <div className="settings-list-row-actions">
                                {view === 'users' ? (
                                    <>
                                        <button
                                            className="settings-btn"
                                            style={{ padding: '8px 12px', fontSize: '12px' }}
                                            onClick={() => notifyOwner(item._id, item.username)}
                                        >
                                            Уведомить
                                        </button>
                                        <button
                                            className="settings-btn"
                                            style={{ padding: '8px 12px', fontSize: '12px', background: item.isBanned ? 'var(--success)' : 'var(--warning)', color: 'black' }}
                                            onClick={() => toggleBan(item._id, item.username, item.isBanned)}
                                        >
                                            {item.isBanned ? 'Разбанить' : 'Бан'}
                                        </button>
                                        <button
                                            className="settings-btn settings-btn-danger"
                                            style={{ padding: '8px 12px', fontSize: '12px' }}
                                            onClick={() => deleteUser(item._id, item.username)}
                                        >
                                            Удалить
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            className="settings-btn"
                                            style={{ padding: '8px 12px', fontSize: '12px' }}
                                            onClick={() => notifyOwner(item.owner?._id, `владельца «${item.name}»`)}
                                        >
                                            Уведомить владельца
                                        </button>
                                        <button
                                            className="settings-btn settings-btn-danger"
                                            style={{ padding: '8px 12px', fontSize: '12px' }}
                                            onClick={() => deleteServer(item._id, item.name)}
                                        >
                                            Удалить
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {totalPages > 1 && (
                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center', gap: '12px' }}>
                    <button 
                        className="settings-btn" 
                        disabled={page === 1} 
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        style={{ padding: '8px 16px', opacity: page === 1 ? 0.5 : 1 }}
                    >
                        Назад
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', fontWeight: 700 }}>{page} / {totalPages}</div>
                    <button 
                        className="settings-btn" 
                        disabled={page === totalPages} 
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        style={{ padding: '8px 16px', opacity: page === totalPages ? 0.5 : 1 }}
                    >
                        Вперёд
                    </button>
                </div>
            )}
        </div>
    );
};

export default AdminUsersSettings;
