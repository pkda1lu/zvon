import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Emoji } from '../types';
import { getFullUrl } from '../utils/avatar';
import { popoverVariants, popoverTransition } from '../animations/transitions';
import './MentionAutocomplete.css';

interface EmojiAutocompleteProps {
    query: string;
    items: Emoji[];
    onSelect: (item: Emoji) => void;
    onClose: () => void;
}

const EmojiAutocomplete: React.FC<EmojiAutocompleteProps> = ({ query, items, onSelect, onClose }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(query.toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 10);

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
                {query ? `Поиск: ${query}` : 'Эмодзи...'}
            </div>
            <div className="mention-autocomplete-list">
                {filteredItems.map((emoji, index) => {
                    const imgUrl = getFullUrl(emoji.url) || emoji.url;

                    return (
                        <div
                            key={emoji.id || emoji.name || index}
                            className={`mention-item ${index === selectedIndex ? 'selected' : ''}`}
                            onClick={() => onSelect(emoji)}
                        >
                            <div className="mention-item-avatar" style={{ background: 'transparent' }}>
                                <img src={imgUrl} alt={emoji.name} style={{ width: 24, height: 24, objectFit: 'contain' }} />
                            </div>
                            <div className="mention-item-name">
                                :{emoji.name}:
                            </div>
                        </div>
                    );
                })}
            </div>
        </motion.div>
    );
};

export default EmojiAutocomplete;
