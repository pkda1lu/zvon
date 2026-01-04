import React, { useState } from 'react';
import axios from 'axios';
import './SettingsModal.css'; // Reusing existing modal styles

interface JoinServerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onJoin: (server: any) => void;
    onCreate: (name: string) => void;
}

const JoinServerModal: React.FC<JoinServerModalProps> = ({ isOpen, onClose, onJoin, onCreate }) => {
    const [view, setView] = useState<'initial' | 'join' | 'create'>('initial');
    const [serverName, setServerName] = useState('');
    const [inviteLink, setInviteLink] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (serverName.trim()) {
            onCreate(serverName.trim());
            onClose();
        }
    };

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Extract code from URL or raw code
            const code = inviteLink.split('/').pop();
            const response = await axios.post(`/api/invites/${code}/join`);
            onJoin(response.data);
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Не удалось присоединиться к серверу');
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '440px', textAlign: 'center' }}>
                {view === 'initial' && (
                    <>
                        <h2>Создайте сервер</h2>
                        <p style={{ color: '#b9bbbe', marginBottom: '20px' }}>
                            Ваш сервер - это место, где вы и ваши друзья можете общаться.
                            Создайте свой собственный или присоединитесь к существующему.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <button
                                className="save-button"
                                onClick={() => setView('create')}
                                style={{ padding: '14px', width: '100%', fontSize: '16px' }}
                            >
                                Создать свой шаблон
                            </button>
                            <button
                                className="cancel-button"
                                onClick={() => setView('join')}
                                style={{ padding: '14px', width: '100%', fontSize: '16px', background: '#4f545c' }}
                            >
                                Присоединиться к серверу
                            </button>
                        </div>
                    </>
                )}

                {view === 'create' && (
                    <form onSubmit={handleCreate}>
                        <h2>Настройте свой сервер</h2>
                        <p style={{ color: '#b9bbbe', marginBottom: '20px' }}>
                            Персонализируйте новый сервер, придумав ему название и выбрав значок.
                            Вы всегда сможете изменить их позже.
                        </p>
                        <div className="form-group">
                            <label>НАЗВАНИЕ СЕРВЕРА</label>
                            <input
                                type="text"
                                value={serverName}
                                onChange={(e) => setServerName(e.target.value)}
                                placeholder="Мой сервер"
                                autoFocus
                            />
                        </div>
                        <div className="modal-buttons" style={{ justifyContent: 'space-between', display: 'flex' }}>
                            <button type="button" onClick={() => setView('initial')} className="cancel-button">
                                Назад
                            </button>
                            <button type="submit" className="save-button" disabled={!serverName.trim()}>
                                Создать
                            </button>
                        </div>
                    </form>
                )}

                {view === 'join' && (
                    <form onSubmit={handleJoin}>
                        <h2>Присоединиться к серверу</h2>
                        <p style={{ color: '#b9bbbe', marginBottom: '20px' }}>
                            Введите приглашение, чтобы присоединиться к существующему серверу.
                        </p>
                        <div className="form-group">
                            <label>ССЫЛКА-ПРИГЛАШЕНИЕ</label>
                            <input
                                type="text"
                                value={inviteLink}
                                onChange={(e) => setInviteLink(e.target.value)}
                                placeholder="https://zvon.com/invite/..."
                                autoFocus
                            />
                            {error && <div className="error-message" style={{ color: '#f23f42', marginTop: '5px' }}>{error}</div>}
                        </div>
                        <div className="modal-buttons" style={{ justifyContent: 'space-between', display: 'flex' }}>
                            <button type="button" onClick={() => setView('initial')} className="cancel-button">
                                Назад
                            </button>
                            <button type="submit" className="save-button" disabled={!inviteLink.trim() || loading}>
                                {loading ? 'Вход...' : 'Присоединиться'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default JoinServerModal;
