import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
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

    const [duration, setDuration] = useState(40);

    const outerRef = useRef<HTMLDivElement>(null);
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
            if (outerRef.current) {
                const h = outerRef.current.offsetHeight;
                document.documentElement.style.setProperty('--brand-banner-height', `${h}px`);
            }
        };

        const t = setTimeout(updateHeight, 30);
        window.addEventListener('resize', updateHeight);

        let resizeObserver: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined' && outerRef.current) {
            resizeObserver = new ResizeObserver(() => updateHeight());
            resizeObserver.observe(outerRef.current);
        }

        return () => {
            clearTimeout(t);
            window.removeEventListener('resize', updateHeight);
            if (resizeObserver) resizeObserver.disconnect();
            document.documentElement.style.setProperty('--brand-banner-height', '0px');
        };
    }, [shouldShow]);

    // Проверка переполнения в одну строчку и вычисление комфортной скорости скролла
    useEffect(() => {
        if (!shouldShow) return;

        const checkOverflow = () => {
            if (containerRef.current && textRef.current) {
                const textWidth = textRef.current.offsetWidth || textRef.current.scrollWidth;
                const containerWidth = containerRef.current.clientWidth;
                const isOver = textWidth > containerWidth;
                setIsOverflowing(isOver);
                if (isOver) {
                    // Скорость ~55px в секунду для спокойного и легкого чтения
                    // Ширина одного цикла = ширина текста + правый отступ 220px
                    const itemWidth = textWidth + 220;
                    const calculated = Math.max(25, Math.round(itemWidth / 55));
                    setDuration(calculated);
                }
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

    const location = useLocation();
    const isLanding = location.pathname === '/' || location.pathname === '/landing';

    // Фоновый градиент по умолчанию берется из темы пользователя
    const themePrimary = customColors?.primary || 'var(--primary-neon, #006aff)';
    const themeSecondary = customColors?.secondary || 'var(--secondary-neon, #7000ff)';
    const bannerBg = `linear-gradient(90deg, ${themePrimary}e6 0%, ${themeSecondary}d9 100%)`;

    return (
        <div ref={outerRef} className="brand-info-banner-outer">
            <AnimatePresence>
                {shouldShow && (
                    <motion.div
                        key={`brand-info-banner-${brand.id}`}
                        className={`brand-info-banner-wrapper ${isLanding ? 'is-landing' : ''}`}
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
                                <div 
                                    className="brand-info-banner-track"
                                    style={isOverflowing ? { animationDuration: `${duration}s` } : undefined}
                                >
                                    <div className="brand-info-banner-item" ref={textRef}>
                                        <div className="brand-info-banner-text">
                                            {renderBannerContent(banner.text)}
                                        </div>
                                    </div>
                                    {isOverflowing && (
                                        <div className="brand-info-banner-item" aria-hidden="true">
                                            <div className="brand-info-banner-text">
                                                {renderBannerContent(banner.text)}
                                            </div>
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
        </div>
    );
};

export default BrandInfoBanner;
