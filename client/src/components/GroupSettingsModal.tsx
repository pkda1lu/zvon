import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { DirectMessage, User } from '../types';
import Modal from './Modal';
import UserAvatar from './UserAvatar';
import UserBadges, { resolveServerTag } from './UserBadges';
import { CameraIcon, CloseIcon, LogOutIcon, SearchIcon, TrashIcon, UserPlusIcon } from './Icons';
import { uploadFiles } from '../utils/transfers';
import { useDialog } from '../contexts/DialogContext';
import './CreateGroupDMModal.css';

/*
 * Настройки групповой переписки: иконка и название, участники, приглашение
 * друзей, выход. Раньше группу можно было только создать — ни добавить
 * человека позже, ни переименовать её было нельзя.
 *
 * Состояние группы приходит с сервера сокет-событием dm-updated (Main), так
 * что окно показывает актуальный состав и после чужих изменений.
 */

const GROUP_MAX = 10;

interface Props {
    isOpen: boolean;
    onClose: () => void;
    dm: DirectMessage;
    currentUserId: string;
    onUserClick: (userId: string) => void;
    onLeft?: () => void;
}

const GroupSettingsModal: React.FC<Props> = ({ isOpen, onClose, dm, currentUserId, onUserClick, onLeft }) => {
    const { alert, confirm } = useDialog();
    const [name, setName] = useState(dm.name || '');
    const [saving, setSaving] = useState(false);
    const [adding, setAdding] = useState(false);
    const [friends, setFriends] = useState<User[]>([]);
    const [picked, setPicked] = useState<User[]>([]);
    const [query, setQuery] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const isOwner = !!dm.owner && String(typeof dm.owner === 'object' ? (dm.owner as any)._id : dm.owner) === String(currentUserId);
    const freeSlots = GROUP_MAX - dm.participants.length;

    useEffect(() => { if (isOpen) setName(dm.name || ''); }, [isOpen, dm.name]);
    useEffect(() => {
        if (!isOpen) { setAdding(false); setPicked([]); setQuery(''); return; }
        axios.get('/api/friends').then(r => setFriends(r.data || [])).catch(() => setFriends([]));
    }, [isOpen]);

    const candidates = useMemo(() => {
        const inGroup = new Set(dm.participants.map(p => p._id));
        const q = query.trim().toLowerCase();
        return friends.filter(f => !inGroup.has(f._id)
            && !picked.some(p => p._id === f._id)
            && (!q || (f.displayName || f.username).toLowerCase().includes(q) || f.username.toLowerCase().includes(q)));
    }, [friends, dm.participants, picked, query]);

    const patch = async (body: Record<string, unknown>) => {
        setSaving(true);
        try { await axios.patch(`/api/direct-messages/${dm._id}`, body); }
        catch (e: any) { await alert(e?.response?.data?.message || 'Не удалось сохранить'); }
        finally { setSaving(false); }
    };

    const onIconFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) { await alert('Нужна картинка'); return; }
        setSaving(true);
        try {
            const res = await uploadFiles([file]);
            await axios.patch(`/api/direct-messages/${dm._id}`, { icon: (res.data as any)[0].url });
        } catch (err: any) {
            await alert(err?.response?.data?.message || 'Не удалось загрузить иконку');
        } finally { setSaving(false); }
    };

    const addPicked = async () => {
        if (picked.length === 0) return;
        setSaving(true);
        try {
            await axios.post(`/api/direct-messages/${dm._id}/participants`, { userIds: picked.map(p => p._id) });
            setPicked([]); setAdding(false);
        } catch (e: any) { await alert(e?.response?.data?.message || 'Не удалось добавить участников'); }
        finally { setSaving(false); }
    };

    const kick = async (u: User) => {
        const ok = await confirm(`Исключить ${u.displayName || u.username} из группы?`, 'Исключить участника', 'Исключить', 'Отмена');
        if (!ok) return;
        try { await axios.delete(`/api/direct-messages/${dm._id}/participants/${u._id}`); }
        catch (e: any) { await alert(e?.response?.data?.message || 'Не удалось исключить'); }
    };

    const leave = async () => {
        const ok = await confirm('Покинуть группу? Вернуться можно, только если вас снова добавят.', 'Покинуть группу', 'Покинуть', 'Отмена');
        if (!ok) return;
        try {
            await axios.delete(`/api/direct-messages/${dm._id}/participants/me`);
            onClose();
            onLeft?.();
        } catch (e: any) { await alert(e?.response?.data?.message || 'Не удалось выйти из группы'); }
    };

    const togglePick = (u: User) => setPicked(prev => prev.some(p => p._id === u._id)
        ? prev.filter(p => p._id !== u._id)
        : (prev.length < freeSlots ? [...prev, u] : prev));

    const title = adding ? 'Добавить участников' : 'Настройки группы';
    const subtitle = adding
        ? `Можно добавить ещё ${Math.max(0, freeSlots - picked.length)}`
        : `${dm.participants.length}/${GROUP_MAX} участников`;

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            size="md"
            className="create-group-modal group-settings-modal"
            footerAlign={adding ? undefined : 'between'}
            footer={adding ? (
                <>
                    <button className="zv-btn zv-btn--ghost" onClick={() => { setAdding(false); setPicked([]); }}>Назад</button>
                    <button className="zv-btn zv-btn--primary" onClick={addPicked} disabled={picked.length === 0 || saving}>
                        {saving ? 'Добавление…' : `Добавить${picked.length ? ` (${picked.length})` : ''}`}
                    </button>
                </>
            ) : (
                <>
                    <button className="zv-btn zv-btn--danger" onClick={leave}>
                        <LogOutIcon size={16} color="currentColor" /> Покинуть группу
                    </button>
                    <button className="zv-btn zv-btn--ghost" onClick={onClose}>Готово</button>
                </>
            )}
        >
            {adding ? (
                <>
                    <div className="search-wrapper">
                        <SearchIcon size={16} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Поиск друзей..."
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            className="user-search-input"
                            autoFocus
                        />
                    </div>
                    {picked.length > 0 && (
                        <div className="selected-users-list custom-scrollbar">
                            {picked.map(u => (
                                <div key={u._id} className="selected-user-tag" onClick={() => togglePick(u)}>
                                    <span>{u.displayName || u.username}</span>
                                    <CloseIcon size={12} />
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="friends-selection-list custom-scrollbar">
                        {candidates.length === 0 ? (
                            <div className="empty-friends-search">
                                {query ? 'Друзья не найдены' : 'Все друзья уже в группе'}
                            </div>
                        ) : candidates.map(f => (
                            <div key={f._id} className="user-selection-item" onClick={() => togglePick(f)}>
                                <div className="user-info">
                                    <UserAvatar user={f} size={32} />
                                    <span className="username">{f.displayName || f.username}</span>
                                    <UserBadges badges={f.badges} serverTag={resolveServerTag(f)} size={12} />
                                </div>
                                <div className="checkbox" />
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <>
                    <div className="group-settings-head">
                        <button
                            type="button"
                            className="group-settings-icon"
                            onClick={() => fileRef.current?.click()}
                            title="Сменить иконку группы"
                            disabled={saving}
                        >
                            <UserAvatar user={{ username: dm.name || 'Группа', avatar: dm.icon || null }} size={64} />
                            <span className="group-settings-icon-overlay"><CameraIcon size={18} color="currentColor" /></span>
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onIconFile} />
                        <div className="group-settings-name">
                            <input
                                type="text"
                                className="group-name-input"
                                placeholder="Название группы"
                                maxLength={100}
                                value={name}
                                onChange={e => setName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && name.trim() !== (dm.name || '')) patch({ name }); }}
                            />
                            <div className="group-settings-name-actions">
                                {dm.icon && (
                                    <button className="zv-btn zv-btn--ghost zv-btn--sm" onClick={() => patch({ icon: null })} disabled={saving}>
                                        <TrashIcon size={14} color="currentColor" /> Убрать иконку
                                    </button>
                                )}
                                <button
                                    className="zv-btn zv-btn--primary zv-btn--sm"
                                    onClick={() => patch({ name })}
                                    disabled={saving || name.trim() === (dm.name || '')}
                                >
                                    Сохранить название
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="group-settings-members-head">
                        <span>Участники</span>
                        <button className="zv-btn zv-btn--secondary zv-btn--sm" onClick={() => setAdding(true)} disabled={freeSlots <= 0}>
                            <UserPlusIcon size={14} color="currentColor" /> Добавить
                        </button>
                    </div>
                    <div className="friends-selection-list custom-scrollbar">
                        {dm.participants.map(p => {
                            const pid = p._id;
                            const owner = !!dm.owner && String(typeof dm.owner === 'object' ? (dm.owner as any)._id : dm.owner) === String(pid);
                            return (
                                <div key={pid} className="user-selection-item" onClick={() => onUserClick(pid)}>
                                    <div className="user-info">
                                        <UserAvatar user={p} size={32} />
                                        <span className="username">{p.displayName || p.username}</span>
                                        <UserBadges badges={p.badges} serverTag={resolveServerTag(p)} size={12} />
                                        {owner && <span className="group-owner-tag">создатель</span>}
                                        {pid === currentUserId && <span className="group-owner-tag muted">вы</span>}
                                    </div>
                                    {isOwner && pid !== currentUserId && (
                                        <button
                                            className="zv-icon-btn zv-icon-btn--sm zv-icon-btn--danger"
                                            title="Исключить из группы"
                                            onClick={e => { e.stopPropagation(); kick(p); }}
                                        >
                                            <CloseIcon size={14} />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </Modal>
    );
};

export default GroupSettingsModal;
