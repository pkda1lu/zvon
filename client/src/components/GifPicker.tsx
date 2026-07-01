import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { popoverVariants, popoverTransition } from '../animations/transitions';
import './GifPicker.css';

interface GifPickerProps {
    onSelect: (url: string) => void;
    onClose: () => void;
}

interface Gif {
    id: string;
    preview: string;
    url: string;
    title?: string;
}

const GifPicker: React.FC<GifPickerProps> = ({ onSelect, onClose }) => {
    const [query, setQuery] = useState('');
    const [gifs, setGifs] = useState<Gif[]>([]);
    const [loading, setLoading] = useState(false);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const fetchGifs = async (searchQuery: string) => {
        setLoading(true);
        try {
            const endpoint = searchQuery.trim()
                ? `/api/gifs/search?q=${encodeURIComponent(searchQuery)}&limit=24`
                : `/api/gifs/trending?limit=24`;
            const response = await axios.get(endpoint);
            setGifs(response.data.results || []);
        } catch (e) {
            console.error('Failed to fetch GIFs:', e);
            setGifs([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGifs('');
    }, []);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQuery(val);

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        searchTimeoutRef.current = setTimeout(() => {
            fetchGifs(val);
        }, 500);
    };

    return (
        <motion.div
            className="gif-picker-container glass-panel-base"
            onClick={(e) => e.stopPropagation()}
            variants={popoverVariants}
            initial="initial"
            animate="animate"
            transition={popoverTransition}
            style={{ transformOrigin: 'bottom right' }}
        >
            <div className="gif-picker-header">
                <input
                    type="text"
                    placeholder="Поиск GIF..."
                    value={query}
                    onChange={handleSearch}
                    className="gif-search-input settings-input"
                    autoFocus
                />
            </div>
            <div className="gif-picker-content">
                {loading && gifs.length === 0 ? (
                    <div className="gif-loading">Загрузка...</div>
                ) : !loading && gifs.length === 0 ? (
                    <div className="gif-loading">{query.trim() ? 'Ничего не найдено' : 'GIF недоступны'}</div>
                ) : (
                    <div className="gif-grid">
                        {gifs.map((gif) => (
                            <div
                                key={gif.id}
                                className="gif-item"
                                onClick={() => { if (gif.url) onSelect(gif.url); }}
                            >
                                <img src={gif.preview || gif.url} alt={gif.title || 'gif'} loading="lazy" />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default GifPicker;
