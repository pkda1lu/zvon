import React, { useState, useEffect } from 'react';
import axios from 'axios';
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

    // Auto-generate invite when opened
    useEffect(() => {
        if (isOpen && !inviteLink) {
            generateInvite();
        }
    }, [isOpen, serverId]);

    const generateInvite = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await axios.post('/api/invites', { serverId });
            // Construct full URL (assuming client is running where window.location is)
            const link = `${window.location.protocol}//${window.location.host}/invite/${response.data.code}`;
            setInviteLink(link);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Не удалось создать приглашение');
        } finally {
            setLoading(false);
        }
    };

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
                    <button className="close-button" onClick={onClose}>✕</button>
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
