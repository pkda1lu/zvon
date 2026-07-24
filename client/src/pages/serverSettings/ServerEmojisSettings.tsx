import React, { useState } from 'react';
import axios from 'axios';
import { Server } from '../../types';
import { getAvatarUrl } from '../../utils/avatar';
import { useDialog } from '../../contexts/DialogContext';
import { PlusIcon, TrashIcon } from '../../components/Icons';

interface Props {
    server: Server;
    onServerUpdate: (updatedServer: Server) => void;
}

const ServerEmojisSettings: React.FC<Props> = ({ server, onServerUpdate }) => {
    const { confirm, alert } = useDialog();
    const [loading, setLoading] = useState(false);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    const handleUpload = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('emoji', file);
            formData.append('name', file.name.split('.')[0].replace(/[^a-zA-Z0-9_]/g, ''));
            try {
                setLoading(true);
                const res = await axios.post(`/api/servers/${server._id}/emojis`, formData);
                onServerUpdate({ ...server, emojis: [...(server.emojis || []), res.data] });
            } catch (err: any) {
                await alert(err.response?.data?.message || 'Ошибка при загрузке эмодзи');
            } finally {
                setLoading(false);
            }
        };
        input.click();
    };

    const handleDelete = async (emojiId: string, name: string) => {
        if (!(await confirm(`Удалить эмодзи :${name}:?`))) return;
        try {
            setLoading(true);
            await axios.delete(`/api/servers/${server._id}/emojis/${emojiId}`);
            onServerUpdate({ ...server, emojis: (server.emojis || []).filter(e => e.id !== emojiId) });
        } catch (err) {
            await alert('Ошибка при удалении эмодзи');
        } finally {
            setLoading(false);
        }
    };

    const startRename = (emojiId: string, currentName: string) => {
        setRenamingId(emojiId);
        setRenameValue(currentName);
    };

    const commitRename = async (emojiId: string) => {
        const name = renameValue.trim().replace(/[^a-zA-Z0-9_]/g, '');
        setRenamingId(null);
        if (!name) return;
        try {
            const res = await axios.patch(`/api/servers/${server._id}/emojis/${emojiId}`, { name });
            onServerUpdate({ ...server, emojis: (server.emojis || []).map(e => e.id === emojiId ? res.data : e) });
        } catch (err) {
            await alert('Ошибка при переименовании эмодзи');
        }
    };

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Эмодзи сервера</h2>
            <p className="settings-description">
                Добавьте до 50 пользовательских эмодзи, которыми сможет пользоваться любой участник этого сервера.
            </p>

            <button className="settings-btn" style={{ marginBottom: '32px' }} onClick={handleUpload} disabled={loading}>
                <PlusIcon size={16} /> Загрузить эмодзи
            </button>

            <div className="settings-list">
                {(server.emojis || []).map(emoji => (
                    <div key={emoji.id} className="settings-list-row">
                        <div className="settings-list-row-icon"><img src={getAvatarUrl(emoji.url)!} alt={emoji.name} style={{ objectFit: 'contain', padding: '4px' }} /></div>
                        <div className="settings-list-row-body">
                            {renamingId === emoji.id ? (
                                <input
                                    className="settings-input"
                                    style={{ padding: '6px 10px', fontSize: '13px' }}
                                    value={renameValue}
                                    autoFocus
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onBlur={() => commitRename(emoji.id)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(emoji.id); if (e.key === 'Escape') setRenamingId(null); }}
                                />
                            ) : (
                                <span
                                    className="settings-list-row-title"
                                    style={{ cursor: 'pointer' }}
                                    title="Нажмите, чтобы переименовать"
                                    onClick={() => startRename(emoji.id, emoji.name)}
                                >
                                    :{emoji.name}:
                                </span>
                            )}
                        </div>
                        <div className="settings-list-row-actions">
                            <button
                                className="action-button danger"
                                onClick={() => handleDelete(emoji.id, emoji.name)}
                            >
                                <TrashIcon size={16} />
                            </button>
                        </div>
                    </div>
                ))}
                {(server.emojis || []).length === 0 && (
                    <div className="server-settings-empty-state">
                        У вас пока нет пользовательских эмодзи.
                    </div>
                )}
            </div>
        </div>
    );
};

export default ServerEmojisSettings;
