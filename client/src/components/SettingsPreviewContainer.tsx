import React, { useRef, useState, useEffect } from 'react';
import { useAppearance } from '../contexts/AppearanceContext';
import { ChevronDownIcon } from './Icons';

interface SettingsPreviewContainerProps {
    baseWidth?: number; // Base width of the preview at scale 1.0 (e.g. 320 for ProfilePreview, 420 for InterfacePreview)
    title?: string;
    children: React.ReactNode;
    className?: string;
}

export const SettingsPreviewContainer: React.FC<SettingsPreviewContainerProps> = ({
    baseWidth = 340,
    title = 'Предпросмотр',
    children,
    className = ''
}) => {
    const { interfaceScale } = useAppearance();
    const wrapperRef = useRef<HTMLDivElement>(null);

    const userScale = interfaceScale || 1;
    const targetWidth = baseWidth * userScale;

    const [isStackedAbove, setIsStackedAbove] = useState<boolean>(false);
    const [isCollapsed, setIsCollapsed] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 768);

    useEffect(() => {
        const updateLayout = () => {
            if (!wrapperRef.current) return;
            
            const contentWrapper = wrapperRef.current.closest('.settings-content-wrapper') as HTMLElement | null;
            const innerWrapper = wrapperRef.current.closest('.settings-content-inner') as HTMLElement | null;
            const mainColumn = innerWrapper?.querySelector('.settings-main-column') as HTMLElement | null;

            if (contentWrapper) {
                const computedStyle = window.getComputedStyle(contentWrapper);
                const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
                const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
                const availableContainerWidth = contentWrapper.clientWidth - paddingLeft - paddingRight;

                // Unified minimum threshold width for the settings main column (560px * userScale)
                const minSettingsWidth = 560 * userScale;
                const gap = 40; // Gap between settings and preview column

                // Calculate required width to comfortably fit BOTH settings main column and preview side-by-side
                const requiredWidthForSideBySide = minSettingsWidth + gap + targetWidth;

                // If available container width is less than required, STACK PREVIEW ABOVE SETTINGS!
                const shouldStack = availableContainerWidth < requiredWidthForSideBySide;

                setIsStackedAbove(prev => {
                    if (prev !== shouldStack) {
                        if (innerWrapper) {
                            if (shouldStack) innerWrapper.classList.add('has-stacked-preview');
                            else innerWrapper.classList.remove('has-stacked-preview');
                        }
                    }
                    return shouldStack;
                });
            }
        };

        const contentWrapper = wrapperRef.current?.closest('.settings-content-wrapper');
        const observer = new ResizeObserver(updateLayout);
        if (contentWrapper) {
            observer.observe(contentWrapper);
        }

        window.addEventListener('resize', updateLayout);
        updateLayout();

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateLayout);
        };
    }, [baseWidth, userScale, targetWidth]);

    return (
        <div 
            ref={wrapperRef}
            className={`settings-preview-container-root ${isStackedAbove ? 'stacked-above' : 'side-by-side'} ${isCollapsed ? 'collapsed' : ''} ${className}`}
            style={{
                width: isStackedAbove ? '100%' : `${targetWidth}px`,
                maxWidth: isStackedAbove ? '100%' : `${targetWidth}px`,
                minWidth: isStackedAbove ? '100%' : `${targetWidth}px`,
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
        >
            <div 
                className="settings-preview-header"
                onClick={() => setIsCollapsed(!isCollapsed)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    marginBottom: isCollapsed ? 0 : '12px'
                }}
            >
                <h3 className="settings-section-title" style={{ margin: 0 }}>
                    {title}
                </h3>
                <button 
                    className={`preview-collapse-toggle ${isCollapsed ? 'collapsed' : ''}`}
                    title={isCollapsed ? 'Развернуть предпросмотр' : 'Свернуть предпросмотр'}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-dim)',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <ChevronDownIcon 
                        size={18} 
                        style={{ 
                            transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', 
                            transition: 'transform 0.3s ease' 
                        }} 
                    />
                </button>
            </div>

            {!isCollapsed && (
                <div 
                    className="settings-preview-content-wrapper"
                    style={{
                        width: `${targetWidth}px`,
                        maxWidth: '100%',
                        margin: '0', // Always aligned to the left!
                        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                >
                    {children}
                </div>
            )}
        </div>
    );
};

export default SettingsPreviewContainer;
