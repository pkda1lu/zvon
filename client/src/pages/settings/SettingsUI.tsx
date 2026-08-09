import React, { useState, useEffect, useRef } from 'react';
import { ChevronDownIcon, BotIcon, LayoutGridIcon } from '../../components/Icons';
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

export interface CustomSelectOption {
    id: string;
    name: string;
    icon?: string;
    iconComponent?: React.ReactNode;
    type?: 'server' | 'user' | 'bot' | 'app' | 'default';
}

/**
 * CustomSelect: Dropdown with avatars/icons and text, supporting single and multi-select modes.
 */
export const CustomSelect: React.FC<{
    options: CustomSelectOption[];
    value?: string;
    selectedValues?: string[];
    onChange?: (id: string) => void;
    onMultiChange?: (ids: string[]) => void;
    multiple?: boolean;
    placeholder?: string;
}> = ({
    options,
    value,
    selectedValues = [],
    onChange,
    onMultiChange,
    multiple = false,
    placeholder = "Выберите вариант..."
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
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

    const filteredOptions = options.filter(opt =>
        opt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        opt.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const renderIcon = (opt: CustomSelectOption) => {
        if (opt.iconComponent) return opt.iconComponent;
        
        const avatarUrl = getAvatarUrl(opt.icon);
        if (avatarUrl) {
            return <div className="custom-select-icon" style={{ backgroundImage: `url(${avatarUrl})` }} />;
        }

        if (opt.type === 'server') {
            return (
                <div className="custom-select-icon server-placeholder">
                    {opt.name.charAt(0).toUpperCase()}
                </div>
            );
        }

        if (opt.type === 'bot') {
            return (
                <div className="custom-select-icon entity-placeholder">
                    <BotIcon size={14} />
                </div>
            );
        }

        if (opt.type === 'app') {
            return (
                <div className="custom-select-icon entity-placeholder">
                    <LayoutGridIcon size={14} />
                </div>
            );
        }

        return null;
    };

    const toggleOption = (id: string) => {
        if (selectedValues.includes(id)) {
            onMultiChange?.(selectedValues.filter(v => v !== id));
        } else {
            onMultiChange?.([...selectedValues, id]);
        }
    };

    const getDisplayText = () => {
        if (multiple) {
            if (selectedValues.length === 0) return placeholder;
            if (selectedValues.length === options.length) return 'Все действия';
            if (selectedValues.length === 1) {
                const opt = options.find(o => o.id === selectedValues[0]);
                return opt ? opt.name : selectedValues[0];
            }
            return `Выбрано: ${selectedValues.length}`;
        }
        return selectedOption ? selectedOption.name : placeholder;
    };

    return (
        <div className="custom-select-container" ref={containerRef}>
            <div className="custom-select-trigger" onClick={() => setIsOpen(!isOpen)}>
                <div className="custom-select-value" style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {!multiple && selectedOption && renderIcon(selectedOption)}
                    <span style={{ color: (multiple ? selectedValues.length > 0 : !!selectedOption) ? 'var(--text-main)' : 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {getDisplayText()}
                    </span>
                </div>
                <div style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {multiple && selectedValues.length > 0 && (
                        <span style={{
                            background: 'var(--primary-neon, #5865f2)',
                            color: '#fff',
                            borderRadius: '10px',
                            padding: '1px 7px',
                            fontSize: '11px',
                            fontWeight: 700
                        }}>
                            {selectedValues.length}
                        </span>
                    )}
                    <ChevronDownIcon size={16} />
                </div>
            </div>

            {isOpen && (
                <div className="custom-select-dropdown" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <input
                        type="text"
                        placeholder="Поиск..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '100%',
                            padding: '6px 10px',
                            fontSize: '12px',
                            borderRadius: '6px',
                            border: '1px solid var(--glass-border)',
                            backgroundColor: 'rgba(0, 0, 0, 0.3)',
                            color: '#fff',
                            marginBottom: '4px'
                        }}
                    />

                    {multiple && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px 4px', fontSize: '11px', borderBottom: '1px solid var(--glass-border)' }}>
                            <button
                                type="button"
                                onClick={() => onMultiChange?.(options.map(o => o.id))}
                                style={{ background: 'none', border: 'none', color: 'var(--primary-neon)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                            >
                                Выбрать все
                            </button>
                            <button
                                type="button"
                                onClick={() => onMultiChange?.([])}
                                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}
                            >
                                Сбросить
                            </button>
                        </div>
                    )}

                    <div style={{ overflowY: 'auto', maxHeight: '180px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {filteredOptions.length === 0 ? (
                            <div style={{ padding: '8px', fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center' }}>
                                Ничего не найдено
                            </div>
                        ) : (
                            filteredOptions.map((opt) => {
                                const isSelected = multiple ? selectedValues.includes(opt.id) : value === opt.id;
                                return (
                                    <div
                                        key={opt.id}
                                        className={`custom-select-option ${isSelected ? 'active' : ''}`}
                                        onClick={() => {
                                            if (multiple) {
                                                toggleOption(opt.id);
                                            } else {
                                                onChange?.(opt.id);
                                                setIsOpen(false);
                                            }
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                    >
                                        {multiple && (
                                            <div style={{
                                                width: '14px',
                                                height: '14px',
                                                borderRadius: '3px',
                                                border: isSelected ? '1px solid var(--primary-neon)' : '1px solid var(--text-dim)',
                                                backgroundColor: isSelected ? 'var(--primary-neon)' : 'transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                fontSize: '10px',
                                                color: '#fff',
                                                fontWeight: 700
                                            }}>
                                                {isSelected ? '✓' : ''}
                                            </div>
                                        )}
                                        {renderIcon(opt)}
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.name}</span>
                                    </div>
                                );
                            })
                        )}
                    </div>
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
    showInput?: boolean;
    inputMin?: number;
    inputMax?: number;
}> = ({ value, min, max, step = 1, onChange, unit = '', showInput = false, inputMin, inputMax }) => {
    const effectiveMin = inputMin !== undefined ? inputMin : min;
    const effectiveMax = inputMax !== undefined ? inputMax : max;
    const [inputValue, setInputValue] = useState<string>(value.toString());

    useEffect(() => {
        setInputValue(value.toString());
    }, [value]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    };

    const commitInput = () => {
        let val = parseFloat(inputValue);
        if (isNaN(val)) {
            val = value;
        } else {
            val = Math.min(effectiveMax, Math.max(effectiveMin, val));
        }
        setInputValue(val.toString());
        onChange(val);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            commitInput();
            (e.target as HTMLInputElement).blur();
        }
    };

    return (
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
            {showInput ? (
                <div className="settings-slider-input-wrapper">
                    <input 
                        type="number" 
                        className="settings-slider-number-input"
                        min={effectiveMin}
                        max={effectiveMax}
                        step={step}
                        value={inputValue}
                        onChange={handleInputChange}
                        onBlur={commitInput}
                        onKeyDown={handleKeyDown}
                    />
                    <span className="settings-slider-unit">{unit}</span>
                </div>
            ) : (
                <span className="settings-slider-value">{value}{unit}</span>
            )}
        </div>
    );
};
