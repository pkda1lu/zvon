import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { popoverVariants, popoverTransition } from '../animations/transitions';
import { DirectMessage, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import ReportModal from './ReportModal';
import './MemberContextMenu.css';

/**
 * Контекстное меню переписки в списке личных сообщений.
 *
 * Оформление берётся у MemberContextMenu — те же классы, чтобы меню в разных
 * местах приложения не выглядели по-разному. Отдельный компонент, а не общий
 * с меню участника: там действия про пользователя на сервере (роли, кик,
 * громкость), здесь — про сам чат.
 */

interface DMContextMenuProps {
    dm: DirectMessage;
    x: number;
    y: number;
    onClose: () => void;
    /** Собеседник — null для групп и для чатов «от имени модерации». */
    otherUser: User | null;
    isMuted: boolean;
    onToggleMute: (dm: DirectMessage, muted: boolean) => void;
    onDelete?: (dm: DirectMessage) => void;
    onOpenProfile?: (userId: string, event?: React.MouseEvent) => void;
    /** Сообщить наверх, что чёрный список изменился. */
    onBlocked?: (userId: string) => void;
}

const DMContextMenu: React.FC<DMContextMenuProps> = ({
    dm, x, y, onClose, otherUser, isMuted, onToggleMute, onDelete, onOpenProfile, onBlocked,
}) => {
    const { refreshUser } = useAuth();
    const { confirm, alert } = useDialog();
    const menuRef = useRef<HTMLDivElement>(null);
    const [adjustedPos, setAdjustedPos] = useState({ top: y, left: x });
    const [isVisible, setIsVisible] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);

    // Меню рисуется скрытым, замеряется и только потом показывается — иначе
    // у края экрана оно успевало бы мигнуть за границей окна.
    useEffect(() => {
        const el = menuRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        let finalX = x;
        let finalY = y;
        if (finalX + rect.width > window.innerWidth) finalX = window.innerWidth - rect.width - 20;
        if (finalY + rect.height > window.innerHeight) finalY = window.innerHeight - rect.height - 20;
        setAdjustedPos({ top: Math.max(10, finalY), left: Math.max(10, finalX) });
        setIsVisible(true);
    }, [x, y]);

    useEffect(() => {
        const onOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
        };
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', onOutside);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onOutside);
            document.removeEventListener('keydown', onEsc);
        };
    }, [onClose]);

    const handleMute = async () => {
        const next = !isMuted;
        try {
            await axios.post(`/api/direct-messages/${dm._id}/mute`, { muted: next });
            onToggleMute(dm, next);
        } catch {
            await alert('Не удалось изменить уведомления.');
        }
        onClose();
    };

    const handleBlock = async () => {
        if (!otherUser) return;
        const name = otherUser.displayName || otherUser.username;
        if (!await confirm(
            `Заблокировать ${name}? Этот человек больше не сможет вам писать. ` +
            `Снять блокировку можно в настройках, раздел «Приватность».`
        )) { onClose(); return; }
        try {
            await axios.post('/api/users/block', { userId: otherUser._id });
            // Обновляем свои данные: чёрный список хранится у пользователя,
            // и без этого настройки показывали бы прежний состав.
            await refreshUser?.();
            onBlocked?.(otherUser._id);
        } catch {
            await alert('Не удалось заблокировать пользователя.');
        }
        onClose();
    };

    const handleDelete = async () => {
        onDelete?.(dm);
        onClose();
    };

    if (showReportModal && otherUser) {
        return ReactDOM.createPortal(
            <ReportModal
                isOpen
                username={otherUser.displayName || otherUser.username}
                onClose={() => { setShowReportModal(false); onClose(); }}
                onSubmit={async (data) => {
                    try {
                        await axios.post('/api/moderation/report', { ...data, userId: otherUser._id });
                        await alert('Жалоба отправлена. Модераторы её рассмотрят.');
                    } catch {
                        await alert('Не удалось отправить жалобу.');
                    }
                    setShowReportModal(false);
                    onClose();
                }}
            />,
            document.body
        );
    }

    return ReactDOM.createPortal(
        <motion.div
            className="member-context-menu"
            ref={menuRef}
            style={{
                top: adjustedPos.top,
                left: adjustedPos.left,
                visibility: isVisible ? 'visible' : 'hidden',
            }}
            variants={popoverVariants}
            initial="initial"
            animate={isVisible ? 'animate' : 'initial'}
            transition={popoverTransition}
        >
            <div className="menu-group">
                {otherUser && onOpenProfile && (
                    <div className="menu-item" onClick={(e) => { onOpenProfile(otherUser._id, e as any); onClose(); }}>
                        Профиль
                    </div>
                )}
                <div className="menu-item" onClick={handleMute}>
                    {isMuted ? 'Включить уведомления' : 'Отключить уведомления'}
                </div>
            </div>

            {/* Жалоба и блокировка — только когда есть на кого. В группе
                непонятно, кого именно блокировать, а в чате модерации это
                означало бы отрезать себе канал обращений. */}
            {otherUser && (
                <>
                    <div className="menu-separator" />
                    <div className="menu-group">
                        <div className="menu-item destructive" onClick={() => setShowReportModal(true)}>
                            Пожаловаться
                        </div>
                        <div className="menu-item destructive" onClick={handleBlock}>
                            Заблокировать
                        </div>
                    </div>
                </>
            )}

            {onDelete && (
                <>
                    <div className="menu-separator" />
                    <div className="menu-group">
                        <div className="menu-item destructive" onClick={handleDelete}>
                            Удалить чат
                        </div>
                    </div>
                </>
            )}
        </motion.div>,
        document.body
    );
};

export default DMContextMenu;
