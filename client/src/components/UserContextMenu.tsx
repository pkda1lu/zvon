import React, { useEffect, useRef } from 'react';
import { User } from '../types';
import { useVoice } from '../contexts/VoiceContext';
import {
    MicMutedIcon,
    SpeakerMutedIcon,
    TrashIcon,
    SettingsIcon,
    PhoneIcon,
    ChatIcon,
    UsersIcon,
    ShieldIcon
} from './Icons';
import './UserContextMenu.css';

interface UserContextMenuProps {
    x: number;
    y: number;
    user: User;
    onClose: () => void;
    onProfileClick: () => void;
    onMessageClick: () => void;
    onCallClick: () => void;
}

const UserContextMenu: React.FC<UserContextMenuProps> = ({
    x, y, user, onClose, onProfileClick, onMessageClick, onCallClick
}) => {
    const { userVolumes, setUserVolume, userStates } = useVoice();
    const menuRef = useRef<HTMLDivElement>(null);

    const currentVolume = userVolumes.get(user._id) ?? 1;
    const isMuted = userStates.get(user._id)?.isMuted ?? false;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Adjust positioning to keep it in viewport
    const adjustedX = Math.min(x, window.innerWidth - 220);
    const adjustedY = Math.min(y, window.innerHeight - 400);

    return (
        <div
            ref={menuRef}
            className="user-context-menu"
            style={{ top: adjustedY, left: adjustedX }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="context-menu-item" onClick={() => { onProfileClick(); onClose(); }}>
                Профиль
            </div>
            <div className="context-menu-item" onClick={() => { onMessageClick(); onClose(); }}>
                Написать сообщение
            </div>
            <div className="context-menu-item" onClick={() => { onCallClick(); onClose(); }}>
                Позвонить
            </div>

            <div className="context-menu-separator" />

            <div className="context-menu-item">
                Добавить заметку
            </div>
            <div className="context-menu-item">
                Добавить никнейм друга
            </div>

            <div className="context-menu-separator" />

            <div className="context-menu-group">
                <div className="context-menu-label">Громкость пользователя</div>
                <div className="volume-slider-container">
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={currentVolume}
                        onChange={(e) => setUserVolume(user._id, parseFloat(e.target.value))}
                        className="context-volume-slider"
                    />
                </div>
            </div>

            <div className="context-menu-item check-item">
                <span>Заглушить</span>
                <input type="checkbox" checked={isMuted} readOnly />
            </div>
            <div className="context-menu-item check-item">
                <span>Заглушить звуковую панель</span>
                <input type="checkbox" />
            </div>

            <div className="context-menu-separator" />

            <div className="context-menu-item">
                Изменить никнейм
            </div>

            <div className="context-menu-item has-submenu">
                Пригласить на сервер
                <span className="submenu-arrow">›</span>
            </div>

            <div className="context-menu-item destructive">
                Удалить из друзей
            </div>
            <div className="context-menu-item">
                Игнорировать
            </div>
            <div className="context-menu-item destructive">
                Заблокировать
            </div>

            <div className="context-menu-separator" />

            <div className="context-menu-label warning">Открыть с доступом модератора</div>
            <div className="context-menu-item destructive check-item">
                <span>Откл. микрофон на сервере</span>
                <input type="checkbox" />
            </div>
            <div className="context-menu-item destructive check-item">
                <span>Сервер: откл. звук</span>
                <input type="checkbox" />
            </div>
            <div className="context-menu-item destructive">
                Отключить
            </div>
        </div>
    );
};

export default UserContextMenu;
