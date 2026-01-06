import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
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
    const { userVolumes, setUserVolume, userStates, localMutes, toggleLocalMute } = useVoice();
    const menuRef = useRef<HTMLDivElement>(null);

    const currentVolume = userVolumes.get(user._id) ?? 1;
    const isMuted = userStates.get(user._id)?.isMuted ?? false; // Remote mute
    const isLocalMuted = localMutes.has(user._id);

    // Simple friend status check (placeholder logic as we don't have friends list here easily without pulling it)
    // For now, we Implement actions that try to work.

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        // Use timeout to avoid immediate close if click event bubbles
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);
        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    const handleAddFriend = async () => {
        try {
            await axios.post('/api/friends/request', { userId: user._id });
            alert('Запрос в друзья отправлен');
        } catch (e: any) {
            console.error(e);
            alert('Ошибка добавления: ' + (e.response?.data?.message || 'Unknown error'));
        }
        onClose();
    };

    // Calculate position to keep in viewport
    // We can't know height effectively before render without ResizeObserver, 
    // but we can use generic bounds.
    const [style, setStyle] = useState<React.CSSProperties>({ top: y, left: x, opacity: 0 });

    useEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            let newY = y;
            let newX = x;
            const windowHeight = window.innerHeight;
            const windowWidth = window.innerWidth;
            const padding = 10;

            // X Positioning
            if (x + rect.width > windowWidth) {
                newX = windowWidth - rect.width - padding;
            }
            if (newX < padding) newX = padding;

            // Y Positioning & Height Constraining
            // Calculate efficient max-height based on available space
            // Default: try to render DOWN
            let maxHeight = windowHeight - newY - padding;

            // If checking upward shift (space below is small, e.g. < 200px, but space above is larger)
            if (windowHeight - y < 250 && y > windowHeight / 2) {
                // Shift UP
                newY = y - rect.height;
                // If that puts us off-top
                if (newY < padding) {
                    newY = padding;
                    maxHeight = windowHeight - padding * 2;
                } else {
                    // Max height is constrained by space from newY to bottom (which is just 'height' essentially) 
                    // OR actually constrained by space from newY to padding?
                    // Let's just set simplified constrained MaxHeight relative to window
                    maxHeight = windowHeight - newY - padding;
                }
            } else {
                // Rendering DOWN
                // Ensure max-height doesn't let it overflow bottom
                // It's already calculated as windowHeight - newY - padding
            }

            // Clamp
            if (maxHeight > windowHeight - 20) maxHeight = windowHeight - 20;

            setStyle({
                top: newY,
                left: newX,
                opacity: 1,
                maxHeight: maxHeight,
                overflowY: 'auto'
            });
        }
    }, [x, y]);

    return (
        <div
            ref={menuRef}
            className="user-context-menu"
            style={style}
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

            <div className="context-menu-item" onClick={() => { alert('Заметки скоро!'); onClose(); }}>
                Добавить заметку
            </div>
            <div className="context-menu-item" onClick={() => { alert('Никнеймы скоро!'); onClose(); }}>
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
                        title={`${Math.round(currentVolume * 100)}%`}
                    />
                </div>
            </div>

            <div className="context-menu-item check-item" onClick={() => toggleLocalMute(user._id)}>
                <span>Заглушить (для себя)</span>
                <input type="checkbox" checked={isLocalMuted} readOnly />
            </div>
            <div className="context-menu-item check-item disabled" style={{ opacity: 0.5 }}>
                <span>Заглушить звуковую панель</span>
                <input type="checkbox" disabled />
            </div>

            <div className="context-menu-separator" />

            <div className="context-menu-item disabled" style={{ opacity: 0.5 }}>
                Изменить никнейм
            </div>

            <div className="context-menu-item has-submenu disabled" style={{ opacity: 0.5 }}>
                Пригласить на сервер
                <span className="submenu-arrow">›</span>
            </div>

            <div className="context-menu-item" onClick={handleAddFriend}>
                Добавить в друзья
            </div>
            <div className="context-menu-item destructive" onClick={() => { alert('Функция удаления пока недоступна отсюда'); onClose(); }}>
                Удалить из друзей
            </div>
            <div className="context-menu-item disabled" style={{ opacity: 0.5 }}>
                Игнорировать
            </div>
            <div className="context-menu-item destructive disabled" style={{ opacity: 0.5 }}>
                Заблокировать
            </div>

            <div className="context-menu-separator" />

            <div className="context-menu-label warning">Открыть с доступом модератора</div>
            <div className="context-menu-item destructive check-item">
                <span>Откл. микрофон (СЕРВЕР)</span>
                <input type="checkbox" checked={isMuted} readOnly title="Статус микрофона пользователя" />
            </div>
            <div className="context-menu-item destructive check-item disabled" style={{ opacity: 0.5 }}>
                <span>Сервер: откл. звук</span>
                <input type="checkbox" disabled />
            </div>
            <div className="context-menu-item destructive disabled" style={{ opacity: 0.5 }}>
                Отключить
            </div>
        </div>
    );
};

export default UserContextMenu;
