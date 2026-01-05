import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { CloseIcon } from './Icons';
import './InviteModal.css';

interface InviteModalProps {
    isOpen: boolean;
    onClose: () => void;
    serverId: string;
}

const InviteModal: React.FC<InviteModalProps> = ({ isOpen, onClose, serverId }) => {
    const [inviteLink, setInviteLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const generateInvite = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await axios.post('/api/invites', { serverId });
            // Construct full URL - handle Electron file:// protocol
            let baseUrl: string;
            if (window.location.protocol === 'file:') {
                // In Electron, use the server URL from environment or default
                const serverUrl = process.env.REACT_APP_SERVER_URL || 'https://serverzvon.duckdns.org';
                baseUrl = serverUrl.replace(/\/$/, ''); // Remove trailing slash
            } else {
                baseUrl = `${window.location.protocol}//${window.location.host}`;
            }
            const link = `${baseUrl}/invite/${response.data.code}`;
            setInviteLink(link);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Не удалось создать приглашение');
        } finally {
            setLoading(false);
        }
    }, [serverId]);

    // Auto-generate invite when opened
    useEffect(() => {
        if (isOpen && !inviteLink) {
            generateInvite();
        }
    }, [isOpen, inviteLink, generateInvite]);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(inviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content invite-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Пригласить друзей</h3>
                    <button className="close-button" onClick={onClose}><CloseIcon /></button>
                </div>

                <div className="modal-body">
                    <p className="invite-label">ОТПРАВЬТЕ ССЫЛКУ-ПРИГЛАШЕНИЕ ДРУГУ</p>

                    <div className="invite-input-wrapper">
                        <input
                            type="text"
                            value={inviteLink}
                            readOnly
                            className="invite-link-input"
                        />
                        <button
                            className={`copy-button ${copied ? 'copied' : ''}`}
                            onClick={copyToClipboard}
                            disabled={loading || !inviteLink}
                        >
                            {copied ? 'Скопировано' : 'Копировать'}
                        </button>
                    </div>

                    <p className="invite-hint">
                        Срок действия вашей ссылки-приглашения истечет через 7 дней.
                    </p>

                    {error && <div className="error-message">{error}</div>}
                </div>
            </div>
        </div>
    );
};

export default InviteModal;
