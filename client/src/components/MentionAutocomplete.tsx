import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { User, Role } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import UserBadges, { resolveServerTag } from './UserBadges';
import { popoverVariants, popoverTransition } from '../animations/transitions';
import './MentionAutocomplete.css';

export interface MentionUserItem extends User {
    nickname?: string;
}

interface MentionAutocompleteProps {
    query: string;
    items: (MentionUserItem | Role)[];
    onSelect: (item: MentionUserItem | Role) => void;
    onClose: () => void;
}

const isUserItem = (item: MentionUserItem | Role): item is MentionUserItem => {
    return 'username' in item;
};

// Приоритет имени: ник на сервере (если есть) -> отображаемый ник пользователя (если есть) -> уникальный ник (username)
const getItemDisplayName = (item: MentionUserItem | Role): string => {
    if (isUserItem(item)) {
        return item.nickname || item.displayName || item.username;
    }
    return (item.name || '').replace(/^@+/, '');
};

const MentionAutocomplete: React.FC<MentionAutocompleteProps> = ({ query, items, onSelect, onClose }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Filter items based on query
    const cleanQuery = query.replace(/^@+/, '').toLowerCase();
    const filteredItems = items.filter(item => {
        if (isUserItem(item)) {
            const serverNick = (item.nickname || '').toLowerCase();
            const dispName = (item.displayName || '').toLowerCase();
            const uname = (item.username || '').toLowerCase();
            return (
                serverNick.includes(cleanQuery) ||
                dispName.includes(cleanQuery) ||
                uname.includes(cleanQuery)
            );
        }
        const roleName = (item.name || '').replace(/^@+/, '').toLowerCase();
        return roleName.includes(cleanQuery);
    }).sort((a, b) => {
        const nameA = getItemDisplayName(a);
        const nameB = getItemDisplayName(b);
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    }).slice(0, 10); // Limit results

    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (filteredItems.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                setSelectedIndex(prev => (prev + 1) % filteredItems.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                if (filteredItems[selectedIndex]) {
                    onSelect(filteredItems[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [filteredItems, selectedIndex, onSelect, onClose]);

    if (filteredItems.length === 0) return null;

    return (
        <motion.div
            className="mention-autocomplete"
            ref={scrollRef}
            variants={popoverVariants}
            initial="initial"
            animate="animate"
            transition={popoverTransition}
            style={{ transformOrigin: 'bottom left' }}
        >
            <div className="mention-autocomplete-header">
                {query ? `Поиск: ${query}` : 'Упомянуть...'}
            </div>
            <div className="mention-autocomplete-list">
                {filteredItems.map((item, index) => {
                    const isUser = isUserItem(item);
                    const displayName = getItemDisplayName(item);

                    return (
                        <div
                            key={'_id' in item ? (item as any)._id : ('id' in item ? (item as any).id : index)}
                            className={`mention-item ${index === selectedIndex ? 'selected' : ''} ${!isUser ? 'role-item' : ''}`}
                            onClick={() => onSelect(item)}
                        >
                            {isUser ? (
                                <div className="mention-item-avatar">
                                    {getAvatarUrl(item.avatar) ? (
                                        <img src={getAvatarUrl(item.avatar)!} alt="" />
                                    ) : (
                                        <span>{displayName.charAt(0).toUpperCase()}</span>
                                    )}
                                </div>
                            ) : (
                                <div className="mention-item-role-icon" style={{ backgroundColor: (item as Role).color }}>
                                    @
                                </div>
                            )}
                            <div className="mention-item-name" style={{ color: !isUser ? (item as Role).color : 'inherit' }}>
                                <span className="mention-name-text">{displayName}</span>
                                {isUser && <UserBadges badges={item.badges} serverTag={resolveServerTag(item as any)} size={12} />}
                                {isUser && item.username && displayName !== item.username && (
                                    <span className="mention-item-username">@{item.username}</span>
                                )}
                                {!isUser && <span className="role-tag">Роль</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </motion.div>
    );
};

export default MentionAutocomplete;
