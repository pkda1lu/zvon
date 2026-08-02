import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Server } from '../../types';
import ImageCropper from '../../components/ImageCropper';
import { useDialog } from '../../contexts/DialogContext';
import { useAuth } from '../../contexts/AuthContext';
import UserAvatar from '../../components/UserAvatar';
import UserBadges from '../../components/UserBadges';
import { GridPicker } from '../settings/SettingsUI';
import { AVAILABLE_BADGES } from '../../data/badges';
import SettingsPreviewContainer from '../../components/SettingsPreviewContainer';
import '../../components/ServerMembers.css';

interface Props {
    server: Server;
    onServerUpdate: (updatedServer: Server) => void;
}

const TAG_COLORS = ['#5865f2', '#ed4245', '#3ba55d', '#faa61a', '#eb459e', '#7289da', '#23272a', '#000000'];

const ServerTagSettings: React.FC<Props> = ({ server, onServerUpdate }) => {
    const { alert } = useDialog();
    const { user: currentUser } = useAuth();
    const [text, setText] = useState(server.tag?.text || '');
    const [color, setColor] = useState(server.tag?.color || '#5865f2');
    const [uploading, setUploading] = useState(false);
    const [cropModal, setCropModal] = useState<{ isOpen: boolean; image: string }>({ isOpen: false, image: '' });
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setText(server.tag?.text || '');
        setColor(server.tag?.color || '#5865f2');
    }, [server._id]);

    const saveField = useCallback(async (field: string, value: any) => {
        try {
            const res = await axios.put(`/api/servers/${server._id}`, { [field]: value });
            onServerUpdate(res.data);
        } catch (e) {
            console.error(`Failed to auto-save ${field}`, e);
        }
    }, [server._id, onServerUpdate]);

    const serverRef = useRef(server);
    useEffect(() => { serverRef.current = server; }, [server]);
    const saveFieldRef = useRef(saveField);
    useEffect(() => { saveFieldRef.current = saveField; }, [saveField]);

    // Текст и цвет подложки — одно логическое поле "tag", сохраняем вместе с паузой после набора текста.
    useEffect(() => {
        const timer = setTimeout(() => {
            const current = serverRef.current.tag;
            if (text !== (current?.text || '') || color !== (current?.color || '#5865f2')) {
                saveFieldRef.current('tag', { text, color });
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [text, color]);

    const handleColorChange = (c: string) => {
        setColor(c);
        saveField('tag', { text, color: c });
    };

    const handlePresetIconSelect = (badgeId: string) => {
        const badge = AVAILABLE_BADGES.find(b => b.id === badgeId);
        if (!badge) return;
        onServerUpdate({ ...server, tag: { ...(server.tag || {}), icon: badge.image } });
        saveField('tag', { text, color, icon: badge.image });
    };

    const selectedPresetIds = AVAILABLE_BADGES.filter(b => b.image === server.tag?.icon).map(b => b.id);

    // Несколько случайных участников сервера — чтобы предпросмотр списка участников не выглядел пустым.
    const randomMembers = React.useMemo(() => {
        const others = (server.members || []).filter(m => (m.user as any)?._id !== currentUser?._id);
        const shuffled = [...others].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, 3);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [server._id]);

    // Позиция профиля со значком: первым, если в списке 1-2 участника, вторым — если 3-4.
    const otherPreviewMembers = randomMembers.map((m: any) => ({ id: m.user._id, user: m.user, nickname: m.nickname }));
    const previewTotal = 1 + otherPreviewMembers.length;
    const tagHolderEntry = { id: 'tag-holder', isTagHolder: true as const };
    const previewList: Array<{ id: string; isTagHolder: true } | { id: string; isTagHolder: false; user: any; nickname?: string }> =
        previewTotal <= 2
            ? [tagHolderEntry, ...otherPreviewMembers.map(o => ({ ...o, isTagHolder: false as const }))]
            : [
                { ...otherPreviewMembers[0], isTagHolder: false as const },
                tagHolderEntry,
                ...otherPreviewMembers.slice(1).map(o => ({ ...o, isTagHolder: false as const }))
            ];

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setCropModal({ isOpen: true, image: reader.result as string });
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleCropComplete = async (croppedBlob: Blob) => {
        setCropModal({ isOpen: false, image: '' });
        const formData = new FormData();
        formData.append('icon', croppedBlob, 'tag-icon.jpg');
        try {
            setUploading(true);
            const res = await axios.post(`/api/servers/${server._id}/tag/icon`, formData);
            onServerUpdate({ ...server, tag: { ...(server.tag || {}), icon: res.data.icon } });
        } catch (err) {
            await alert('Ошибка при загрузке иконки значка');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="settings-content-inner with-preview">
            <div className="settings-main-column">
                <h2 className="settings-page-title">Значок сервера</h2>
                <p className="settings-description">
                    Значок сервера отображается рядом с ником участника вместо значка профиля.
                </p>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{ marginTop: 0 }}>Текст (до 5 символов)</h3>
                    <input className="settings-input" value={text} onChange={(e) => setText(e.target.value.slice(0, 5))} maxLength={5} placeholder={server.name.slice(0, 5).toUpperCase()} />
                </div>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{ marginTop: 0 }}>Иконка</h3>
                    <p className="settings-description">Небольшое квадратное изображение слева в значке. Выберите из готовых иконок профиля или загрузите свою.</p>
                    <GridPicker
                        items={AVAILABLE_BADGES}
                        selectedIds={selectedPresetIds}
                        onToggle={handlePresetIconSelect}
                    />
                    <div className="settings-sidebar-divider" style={{ margin: '20px 0' }} />
                    <div className="settings-row">
                        <div className="settings-row-text">
                            <p>Или загрузите собственное изображение.</p>
                        </div>
                        <button className="settings-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>{server.tag?.icon ? 'Изменить' : 'Загрузить'}</button>
                    </div>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileSelect} />
                </div>

                <div className="settings-card">
                    <h3 className="settings-section-title" style={{ marginTop: 0 }}>Цвет</h3>
                    <p className="settings-description">Подложка значка почти прозрачна, рамка и текст — в этом цвете.</p>
                    <div className="color-swatches">
                        {TAG_COLORS.map(c => (
                            <div key={c} className={`color-swatch ${color === c ? 'active' : ''}`} style={{ backgroundColor: c }} onClick={() => handleColorChange(c)} />
                        ))}
                        <input type="color" className="color-input-custom" value={color} onChange={(e) => handleColorChange(e.target.value)} />
                    </div>
                </div>
            </div>

            <SettingsPreviewContainer baseWidth={340} title="Предпросмотр в списке участников">
                <div className="server-tag-member-preview">
                    {previewList.map(item => item.isTagHolder ? (
                        <div key={item.id} className="member-item" style={{ cursor: 'default' }}>
                            <div className="member-avatar-wrap">
                                <UserAvatar user={currentUser} size={32} className="member-avatar" />
                                <div className="status-indicator online" />
                            </div>
                            <div className="member-info">
                                <div className="member-name-row">
                                    <span className="member-name">{currentUser?.username || 'Участник'}</span>
                                    <UserBadges serverTag={{ text: text || server.name.slice(0, 5).toUpperCase(), icon: server.tag?.icon, color }} size={14} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        // Остальные участники — приглушены (offline), чтобы выделялся только владелец значка
                        <div key={item.id} className="member-item offline" style={{ cursor: 'default' }}>
                            <div className="member-avatar-wrap">
                                <UserAvatar user={item.user} size={32} className="member-avatar" />
                                <div className={`status-indicator ${item.user.status || 'offline'}`} />
                            </div>
                            <div className="member-info">
                                <div className="member-name-row">
                                    <span className="member-name">{item.nickname || item.user.username}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </SettingsPreviewContainer>

            {cropModal.isOpen && (
                <ImageCropper
                    image={cropModal.image}
                    cropShape="rect"
                    aspect={1}
                    title="Обрезка иконки значка"
                    onCropComplete={handleCropComplete}
                    onCancel={() => setCropModal({ isOpen: false, image: '' })}
                />
            )}
        </div>
    );
};

export default ServerTagSettings;
