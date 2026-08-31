import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { User, Role } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import UserBadges, { resolveServerTag } from './UserBadges';
import { popoverVariants, popoverTransition } from '../animations/transitions';
import './MentionAutocomplete.css';

interface MentionAutocompleteProps {
    query: string;
    items: (User | Role)[];
    onSelect: (item: User | Role) => void;
    onClose: () => void;
}

const MentionAutocomplete: React.FC<MentionAutocompleteProps> = ({ query, items, onSelect, onClose }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Filter items based on query
    const cleanQuery = query.replace(/^@+/, '').toLowerCase();
    const filteredItems = items.filter(item => {
        const rawName = 'username' in item ? item.username : item.name;
        const name = (rawName || '').replace(/^@+/, '');
        return name.toLowerCase().includes(cleanQuery);
    }).sort((a, b) => {
        const nameA = ('username' in a ? a.username : a.name || '').replace(/^@+/, '');
        const nameB = ('username' in b ? b.username : b.name || '').replace(/^@+/, '');
        return nameA.localeCompare(nameB);
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
                    const isUser = 'username' in item;
                    const rawName = isUser ? item.username : item.name;
                    const name = (rawName || '').replace(/^@+/, '');

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
                                        <span>{name.charAt(0).toUpperCase()}</span>
                                    )}
                                </div>
                            ) : (
                                <div className="mention-item-role-icon" style={{ backgroundColor: (item as Role).color }}>
                                    @
                                </div>
                            )}
                            <div className="mention-item-name" style={{ color: !isUser ? (item as Role).color : 'inherit' }}>
                                {name}
                                {isUser && <UserBadges badges={item.badges} serverTag={resolveServerTag(item as any)} size={12} />}
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
