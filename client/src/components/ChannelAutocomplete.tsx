import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Channel } from '../types';
import { HashtagIcon, SpeakerIcon, CubeIcon } from './Icons';
import { popoverVariants, popoverTransition } from '../animations/transitions';
import './MentionAutocomplete.css';

interface ChannelAutocompleteProps {
    query: string;
    items: Channel[];
    onSelect: (item: Channel) => void;
    onClose: () => void;
}

const ChannelAutocomplete: React.FC<ChannelAutocompleteProps> = ({ query, items, onSelect, onClose }) => {
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

    const renderChannelIcon = (type: Channel['type']) => {
        if (type === 'voice') return <SpeakerIcon size={16} color="var(--text-dim)" />;
        if (type === 'room') return <CubeIcon size={16} color="var(--text-dim)" />;
        return <HashtagIcon size={16} color="var(--text-dim)" />;
    };

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
                {query ? `Поиск: ${query}` : 'Каналы...'}
            </div>
            <div className="mention-autocomplete-list">
                {filteredItems.map((channel, index) => (
                    <div
                        key={channel._id}
                        className={`mention-item ${index === selectedIndex ? 'selected' : ''}`}
                        onClick={() => onSelect(channel)}
                    >
                        <div className="mention-item-role-icon channel-icon" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
                            {renderChannelIcon(channel.type)}
                        </div>
                        <div className="mention-item-name">
                            {channel.name}
                        </div>
                    </div>
                ))}
            </div>
        </motion.div>
    );
};

export default ChannelAutocomplete;
