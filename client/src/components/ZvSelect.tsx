import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon, CheckIcon } from './Icons';
import '../styles/select.css';

/*
 * Выпадающий список Zvon — замена системному <select>.
 *
 * Системный список рисовался белым окном браузера посреди тёмного интерфейса
 * (создание канала, категории, приглашения, баны, посты). Этот компонент
 * повторяет интерфейс <select>: те же дочерние <option>, value/defaultValue,
 * onChange с e.target.value — замена в разметке сводится к имени тега.
 *
 * Список рисуется порталом в body с фиксированной позицией: в модалках с
 * overflow: hidden обычный абсолютный список обрезался бы. Клавиатура:
 * ↑/↓, Enter, Esc, Home/End; при большом числе вариантов — поиск.
 */

interface OptionData {
    value: string;
    label: React.ReactNode;
    text: string;
    disabled: boolean;
}

export interface ZvSelectChangeEvent {
    target: { value: string; name?: string };
    currentTarget: { value: string; name?: string };
}

interface ZvSelectProps {
    value?: string | number | null;
    defaultValue?: string | number;
    onChange?: (e: ZvSelectChangeEvent) => void;
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    id?: string;
    name?: string;
    disabled?: boolean;
    placeholder?: string;
    'aria-label'?: string;
}

const SEARCH_THRESHOLD = 8;

const textOf = (node: React.ReactNode): string => {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(textOf).join('');
    if (React.isValidElement(node)) return textOf((node.props as any).children);
    return '';
};

const collectOptions = (children: React.ReactNode): OptionData[] => {
    const out: OptionData[] = [];
    React.Children.forEach(children, (child) => {
        if (!React.isValidElement(child)) return;
        const props = child.props as any;
        if (child.type === React.Fragment) { out.push(...collectOptions(props.children)); return; }
        if (child.type === 'option') {
            const label = props.children;
            out.push({
                value: props.value !== undefined ? String(props.value) : textOf(label),
                label,
                text: textOf(label).trim(),
                disabled: !!props.disabled,
            });
        }
    });
    return out;
};

const ZvSelect: React.FC<ZvSelectProps> = ({
    value, defaultValue, onChange, children, className = '', style, id, name, disabled, placeholder, ...rest
}) => {
    const options = useMemo(() => collectOptions(children), [children]);
    const controlled = value !== undefined;
    const [inner, setInner] = useState<string>(defaultValue !== undefined ? String(defaultValue) : (options[0]?.value ?? ''));
    const current = controlled ? (value === null ? '' : String(value)) : inner;
    const selected = options.find(o => o.value === current);

    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [query, setQuery] = useState('');
    const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean; maxH: number } | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? options.filter(o => o.text.toLowerCase().includes(q)) : options;
    }, [options, query]);

    // Позиция списка под полем (или над ним, если снизу не помещается).
    const place = useCallback(() => {
        const t = triggerRef.current;
        if (!t) return;
        const r = t.getBoundingClientRect();
        const below = window.innerHeight - r.bottom - 12;
        const above = r.top - 12;
        const up = below < 200 && above > below;
        const maxH = Math.max(120, Math.min(300, up ? above : below));
        setPos({ left: r.left, top: up ? r.top - 6 : r.bottom + 6, width: r.width, up, maxH });
    }, []);

    useLayoutEffect(() => { if (open) place(); }, [open, place]);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            const target = e.target as Node;
            if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onMove = () => place();
        document.addEventListener('mousedown', onDoc);
        window.addEventListener('resize', onMove);
        window.addEventListener('scroll', onMove, true);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            window.removeEventListener('resize', onMove);
            window.removeEventListener('scroll', onMove, true);
        };
    }, [open, place]);

    // Выделенный пункт — в зону видимости.
    useEffect(() => {
        if (!open || active < 0) return;
        listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active, open]);

    const openList = () => {
        if (disabled) return;
        setQuery('');
        setActive(Math.max(0, options.findIndex(o => o.value === current)));
        setOpen(true);
    };

    const choose = (opt: OptionData) => {
        if (opt.disabled) return;
        if (!controlled) setInner(opt.value);
        setOpen(false);
        triggerRef.current?.focus();
        if (opt.value !== current || !controlled) {
            onChange?.({ target: { value: opt.value, name }, currentTarget: { value: opt.value, name } });
        }
    };

    const move = (dir: 1 | -1) => {
        if (!visible.length) return;
        let i = active;
        for (let n = 0; n < visible.length; n++) {
            i = (i + dir + visible.length) % visible.length;
            if (!visible[i].disabled) break;
        }
        setActive(i);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (disabled) return;
        if (!open) {
            if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
            return;
        }
        if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
        else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
        else if (e.key === 'End') { e.preventDefault(); setActive(visible.length - 1); }
        else if (e.key === 'Enter') { e.preventDefault(); if (visible[active]) choose(visible[active]); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        else if (e.key === 'Tab') setOpen(false);
    };

    const showSearch = options.length > SEARCH_THRESHOLD;
    const labelNode = selected && !(selected.value === '' && selected.disabled) ? selected.label : null;

    return (
        <div className={`zv-select ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`} style={style}>
            <button
                ref={triggerRef}
                type="button"
                id={id}
                className="zv-select__trigger"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={rest['aria-label']}
                disabled={disabled}
                onClick={() => (open ? setOpen(false) : openList())}
                onKeyDown={onKeyDown}
            >
                <span className={`zv-select__value ${labelNode ? '' : 'is-placeholder'}`}>
                    {labelNode ?? (selected?.label || placeholder || 'Выберите…')}
                </span>
                <ChevronDownIcon size={16} className="zv-select__chevron" />
            </button>

            {open && pos && createPortal(
                <div
                    ref={listRef}
                    className={`zv-select__list ${pos.up ? 'is-up' : ''}`}
                    role="listbox"
                    style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxH }}
                    onKeyDown={onKeyDown}
                >
                    {showSearch && (
                        <input
                            className="zv-select__search"
                            autoFocus
                            placeholder="Поиск…"
                            value={query}
                            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                        />
                    )}
                    {visible.length === 0 && <div className="zv-select__empty">Ничего не найдено</div>}
                    {visible.map((o, i) => (
                        <div
                            key={`${o.value}-${i}`}
                            data-index={i}
                            role="option"
                            aria-selected={o.value === current}
                            aria-disabled={o.disabled}
                            className={`zv-select__option ${o.value === current ? 'is-selected' : ''} ${i === active ? 'is-active' : ''} ${o.disabled ? 'is-disabled' : ''}`}
                            onMouseEnter={() => setActive(i)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => choose(o)}
                        >
                            <span className="zv-select__option-label">{o.label}</span>
                            {o.value === current && <CheckIcon size={14} className="zv-select__check" />}
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};

export default ZvSelect;
