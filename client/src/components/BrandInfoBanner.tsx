import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCurrentBrand } from '../utils/branding';
import { useAppearance } from '../contexts/AppearanceContext';
import { CloseIcon } from './Icons';
import './BrandInfoBanner.css';

/**
 * Parses URLs and markdown links [текст](url) into clickable anchor tags
 */
export const renderBannerContent = (text: string): React.ReactNode => {
    if (!text) return null;
    const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            elements.push(text.substring(lastIndex, match.index));
        }
        if (match[1] && match[2]) {
            elements.push(
                <a
                    key={match.index}
                    href={match[2]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="brand-banner-link"
                    onClick={e => e.stopPropagation()}
                >
                    {match[1]}
                </a>
            );
        } else if (match[3]) {
            elements.push(
                <a
                    key={match.index}
                    href={match[3]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="brand-banner-link"
                    onClick={e => e.stopPropagation()}
                >
                    {match[3]}
                </a>
            );
        }
        lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
        elements.push(text.substring(lastIndex));
    }

    return elements;
};

export const BrandInfoBanner: React.FC = () => {
    const brand = useCurrentBrand();
    const banner = brand.banner;
    const { customColors } = useAppearance();

    const [isDismissed, setIsDismissed] = useState(false);
    const [isOverflowing, setIsOverflowing] = useState(false);

    const wrapperRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);

    const bannerKey = banner?.text ? `dismissed_banner_${brand.id}_${encodeURIComponent(banner.text)}` : '';
    const shouldShow = !!(banner && banner.enabled && banner.text && !isDismissed);

    useEffect(() => {
        if (!bannerKey) {
            setIsDismissed(false);
            return;
        }
        try {
            const dismissed = sessionStorage.getItem(bannerKey);
            setIsDismissed(dismissed === 'true');
        } catch {
            setIsDismissed(false);
        }
    }, [bannerKey]);

    // Обновляем CSS-переменную --brand-banner-height на :root, чтобы весь интерфейс подстраивал высоту
    useEffect(() => {
        if (!shouldShow) {
            document.documentElement.style.setProperty('--brand-banner-height', '0px');
            return;
        }

        const updateHeight = () => {
            if (wrapperRef.current) {
                const h = wrapperRef.current.offsetHeight;
                document.documentElement.style.setProperty('--brand-banner-height', `${h}px`);
            }
        };

        // Задержка на следующий кадр для корректного чтения высоты
        const t = setTimeout(updateHeight, 30);
        window.addEventListener('resize', updateHeight);

        let resizeObserver: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined' && wrapperRef.current) {
            resizeObserver = new ResizeObserver(() => updateHeight());
            resizeObserver.observe(wrapperRef.current);
        }

        return () => {
            clearTimeout(t);
            window.removeEventListener('resize', updateHeight);
            if (resizeObserver) resizeObserver.disconnect();
            document.documentElement.style.setProperty('--brand-banner-height', '0px');
        };
    }, [shouldShow]);

    // Проверка переполнения в одну строчку
    useEffect(() => {
        if (!shouldShow) return;

        const checkOverflow = () => {
            if (containerRef.current && textRef.current) {
                const isOver = textRef.current.scrollWidth > containerRef.current.clientWidth;
                setIsOverflowing(isOver);
            }
        };

        const t = setTimeout(checkOverflow, 40);
        window.addEventListener('resize', checkOverflow);
        return () => {
            clearTimeout(t);
            window.removeEventListener('resize', checkOverflow);
        };
    }, [shouldShow, banner?.text]);

    const handleDismiss = () => {
        setIsDismissed(true);
        document.documentElement.style.setProperty('--brand-banner-height', '0px');
        if (bannerKey) {
            try {
                sessionStorage.setItem(bannerKey, 'true');
            } catch { /* ignore storage error */ }
        }
    };

    // Background color strictly depends on user's theme settings
    const themePrimary = customColors?.primary || 'var(--primary-neon, #5865f2)';
    const themeSecondary = customColors?.secondary || 'var(--secondary-neon, #7000ff)';
    const bannerBg = `linear-gradient(90deg, ${themePrimary}e6 0%, ${themeSecondary}d9 100%)`;

    return (
        <AnimatePresence>
            {shouldShow && (
                <motion.div
                    ref={wrapperRef}
                    className="brand-info-banner-wrapper"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                    <div
                        className="brand-info-banner"
                        style={{ background: bannerBg }}
                    >
                        <div 
                            className={`brand-info-banner-content ${isOverflowing ? 'is-overflowing' : ''}`}
                            ref={containerRef}
                        >
                            <div className="brand-info-banner-track">
                                <div className="brand-info-banner-text" ref={textRef}>
                                    {renderBannerContent(banner.text)}
                                </div>
                                {isOverflowing && (
                                    <div className="brand-info-banner-text brand-info-banner-text-duplicate" aria-hidden="true">
                                        {renderBannerContent(banner.text)}
                                    </div>
                                )}
                            </div>
                        </div>

                        {banner.closable !== false && (
                            <button
                                type="button"
                                className="brand-info-banner-close"
                                onClick={handleDismiss}
                                title="Скрыть уведомление"
                                aria-label="Закрыть"
                            >
                                <CloseIcon size={14} color="#ffffff" />
                            </button>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default BrandInfoBanner;
