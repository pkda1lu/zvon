import React, { useState, useEffect, useRef } from 'react';
import { ChevronDownIcon } from '../../components/Icons';
import { getAvatarUrl } from '../../utils/avatar';

/**
 * ChoiceGroup: Horizontal selection on a single dark background.
 * Items in one row, selected item gets a lighter background.
 */
export const ChoiceGroup: React.FC<{
    options: { value: string; label: string; icon?: React.ReactNode; color?: string }[];
    value: string;
    onChange: (value: string) => void;
    className?: string;
}> = ({ options, value, onChange, className = '' }) => {
    return (
        <div className={`settings-choice-group ${className}`}>
            {options.map((opt) => (
                <div 
                    key={opt.value} 
                    className={`settings-choice-item ${value === opt.value ? 'active' : ''}`}
                    onClick={() => onChange(opt.value)}
                >
                    {opt.icon && <span style={{ color: opt.color }}>{opt.icon}</span>}
                    {opt.label}
                </div>
            ))}
        </div>
    );
};

/**
 * CustomSelect: Dropdown with avatars/icons and text.
 */
export const CustomSelect: React.FC<{
    options: { id: string; name: string; icon?: string; iconComponent?: React.ReactNode }[];
    value: string;
    onChange: (id: string) => void;
    placeholder?: string;
}> = ({ options, value, onChange, placeholder = "Выберите вариант..." }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const selectedOption = options.find(o => o.id === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="custom-select-container" ref={containerRef}>
            <div className="custom-select-trigger" onClick={() => setIsOpen(!isOpen)}>
                <div className="custom-select-value">
                    {selectedOption ? (
                        <>
                            {selectedOption.iconComponent ? selectedOption.iconComponent : (
                                <div className="custom-select-icon" style={{ backgroundImage: `url(${getAvatarUrl(selectedOption.icon)})` }} />
                            )}
                            <span>{selectedOption.name}</span>
                        </>
                    ) : <span style={{ color: 'var(--text-faint)' }}>{placeholder}</span>}
                </div>
                <div style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'flex' }}>
                    <ChevronDownIcon size={16} />
                </div>
            </div>
            {isOpen && (
                <div className="custom-select-dropdown">
                    {options.map((opt) => (
                        <div 
                            key={opt.id} 
                            className={`custom-select-option ${value === opt.id ? 'active' : ''}`}
                            onClick={() => {
                                onChange(opt.id);
                                setIsOpen(false);
                            }}
                        >
                            {opt.iconComponent ? opt.iconComponent : (
                                <div className="custom-select-icon" style={{ backgroundImage: `url(${getAvatarUrl(opt.icon)})` }} />
                            )}
                            <span>{opt.name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

/**
 * GridPicker: Visual items in a grid (e.g. badges).
 */
export const GridPicker: React.FC<{
    items: { id: string; label: string; image?: string; icon?: React.ReactNode }[];
    selectedIds: string[];
    onToggle: (id: string) => void;
    multi?: boolean;
}> = ({ items, selectedIds, onToggle, multi = false }) => {
    return (
        <div className="settings-grid-picker">
            {items.map((item) => {
                const isActive = selectedIds.includes(item.id);
                return (
                    <div 
                        key={item.id} 
                        className={`grid-picker-item ${isActive ? 'active' : ''}`}
                        onClick={() => onToggle(item.id)}
                    >
                        {item.image ? (
                            <img src={item.image} className="grid-picker-img" alt={item.label} />
                        ) : item.icon}
                        <div className="grid-picker-label">{item.label}</div>
                    </div>
                );
            })}
        </div>
    );
};

/**
 * SettingsToggle: A stylized switch.
 */
export const SettingsToggle: React.FC<{
    checked: boolean;
    onChange: (val: boolean) => void;
}> = ({ checked, onChange }) => (
    <label className="settings-toggle">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="toggle-slider" />
    </label>
);

/**
 * RangeSlider: Stylized slider for numeric values.
 */
export const RangeSlider: React.FC<{
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (val: number) => void;
    unit?: string;
}> = ({ value, min, max, step = 1, onChange, unit = '' }) => (
    <div className="settings-slider-container">
        <input 
            type="range" 
            className="settings-range-input"
            min={min} 
            max={max} 
            step={step} 
            value={value} 
            onChange={(e) => onChange(parseFloat(e.target.value))} 
        />
        <span className="settings-slider-value">{value}{unit}</span>
    </div>
);
