import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import UserAvatar from './UserAvatar';
import { useDialog } from '../contexts/DialogContext';
import { useAuth } from '../contexts/AuthContext';
import { User } from '../types';
import './BlockedUsersSection.css';

/**
 * Чёрный список — раздел настроек приватности.
 *
 * Блокировка ставится из контекстного меню переписки, а снимается здесь:
 * заблокированный чат из списка уходит, и вернуть его оттуда уже нельзя.
 * Без этого раздела блокировка была бы действием без отмены.
 *
 * Список запрашивается с сервера, а не берётся из профиля: в профиле лежат
 * одни идентификаторы, а показать нужно имя и аватарку.
 */
const BlockedUsersSection: React.FC = () => {
    const { refreshUser } = useAuth();
    const { confirm, alert } = useDialog();
    const [blocked, setBlocked] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await axios.get('/api/users/blocked');
            setBlocked(res.data || []);
        } catch {
            setBlocked([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const unblock = async (u: User) => {
        const name = u.displayName || u.username;
        if (!await confirm(`Разблокировать ${name}? Этот человек снова сможет вам писать.`)) return;
        setBusyId(u._id);
        try {
            await axios.post('/api/users/unblock', { userId: u._id });
            setBlocked(prev => prev.filter(b => b._id !== u._id));
            await refreshUser?.();
        } catch {
            await alert('Не удалось снять блокировку.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="settings-card blocked-section">
            <h3 className="blocked-title">Чёрный список</h3>
            <p className="blocked-description">
                Заблокированные не могут вам писать. Заблокировать можно правым щелчком
                по переписке в списке личных сообщений.
            </p>

            {loading ? (
                <div className="blocked-empty">Загрузка…</div>
            ) : blocked.length === 0 ? (
                <div className="blocked-empty">Список пуст.</div>
            ) : (
                <div className="blocked-list">
                    {blocked.map(u => (
                        <div key={u._id} className="blocked-row">
                            <UserAvatar user={u} size={36} />
                            <span className="blocked-name">{u.displayName || u.username}</span>
                            <button
                                className="blocked-unblock"
                                disabled={busyId === u._id}
                                onClick={() => unblock(u)}
                            >
                                {busyId === u._id ? 'Снимаем…' : 'Разблокировать'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default BlockedUsersSection;
