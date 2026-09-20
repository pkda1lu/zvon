import { useState, useEffect } from 'react';

export interface AppIconOption {
    id: string;
    label: string;
    img: string;
    isPrimary?: boolean;
}

export interface BrandBannerConfig {
    enabled: boolean;
    text: string;
    closable?: boolean;
    bg?: string;
    color?: string;
}

export type DomainBehavior = 'open' | 'redirect' | 'disabled';

export interface BrandConfig {
    id: string;
    name: string;
    logo: string;
    favicon: string;
    domain?: string;
    domainBehavior?: DomainBehavior;
    supportEmail?: string;
    enabled?: boolean;
    isBuiltin?: boolean;
    banner?: BrandBannerConfig;
    appIcons: AppIconOption[];
}

export const BRANDS: Record<string, BrandConfig> = {
    zvon: {
        id: 'zvon',
        name: 'Zvon',
        logo: 'zvonlogonew.png',
        favicon: 'icon.png',
        domain: 'zvonserver.ru',
        supportEmail: 'support@zvonserver.ru',
        enabled: true,
        isBuiltin: true,
        banner: {
            enabled: false,
            text: '',
            closable: true,
            bg: '',
            color: ''
        },
        appIcons: [
            { id: 'default', label: 'Стандарт', img: 'icon.png', isPrimary: true },
            { id: 'icon1', label: 'Неон', img: 'icon1.PNG' },
            { id: 'icon2', label: 'Лазурь', img: 'icon2.png' },
            { id: 'icon3', label: 'Аметист', img: 'icon3.png' },
            { id: 'icon4', label: 'Космос', img: 'icon4.png' },
            { id: 'legacy', label: 'Легаси', img: 'zvon_legacy.png' }
        ]
    },
    maxcord: {
        id: 'maxcord',
        name: 'MAXCORD',
        logo: 'maxcord/logo.png',
        favicon: 'maxcord/logo.png',
        domain: 'maxcord.fun',
        supportEmail: 'support@zvonserver.ru',
        enabled: true,
        isBuiltin: false,
        banner: {
            enabled: false,
            text: '',
            closable: true,
            bg: '',
            color: ''
        },
        appIcons: [
            { id: 'max_default', label: 'Градиент', img: 'maxcord/logo.png', isPrimary: true },
            { id: 'max_white', label: 'Белый', img: 'maxcord/logo-trans.png' },
        ]
    }
};

// Hydrate from server-injected script or localStorage cache immediately
if (typeof window !== 'undefined') {
    try {
        const cached = localStorage.getItem('zvon_cached_brands');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && typeof parsed === 'object') {
                Object.assign(BRANDS, parsed);
            }
        }
    } catch { /* ignore cache read error */ }

    if ((window as any).__INITIAL_BRAND__) {
        const initial = (window as any).__INITIAL_BRAND__;
        if (initial && initial.id) {
            BRANDS[initial.id] = {
                ...BRANDS[initial.id],
                ...initial
            };
        }
    }
}

export const BRAND_FALLBACK_COLORS = ['#3b82f6', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

export const getBrandColor = (_brandId?: string, index = 0): string => {
    return BRAND_FALLBACK_COLORS[index % BRAND_FALLBACK_COLORS.length];
};

const withZvonFallback = (b: BrandConfig): BrandConfig => {
    if (!b) return BRANDS.zvon;
    if (b.id === 'zvon') return b;
    const zvon = BRANDS.zvon;
    return {
        ...b,
        logo: b.logo?.trim() ? b.logo : (zvon?.logo || 'zvonlogonew.png'),
        favicon: b.favicon?.trim() ? b.favicon : (zvon?.favicon || 'icon.png'),
        supportEmail: b.supportEmail?.trim() ? b.supportEmail : (zvon?.supportEmail || 'support@zvonserver.ru')
    };
};

/**
 * Registers or updates a brand in the client-side registry
 */
export const updateBrandInRegistry = (brand: BrandConfig) => {
    BRANDS[brand.id] = withZvonFallback({
        ...BRANDS[brand.id],
        ...brand
    });
    if (brand.id === 'zvon') {
        BRANDS.zvon.enabled = true;
    }
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem('zvon_cached_brands', JSON.stringify(BRANDS));
        } catch { /* ignore cache write error */ }
        window.dispatchEvent(new CustomEvent('zvon-brand-updated', { detail: brand }));
    }
};

/**
 * Removes a brand from the client registry (except zvon)
 */
export const removeBrandFromRegistry = (brandId: string) => {
    if (brandId === 'zvon' || !BRANDS[brandId]) return;
    delete BRANDS[brandId];
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('zvon-brand-updated', { detail: { id: brandId, deleted: true } }));
    }
};

/**
 * Resolves the currently active brand.
 * Zvon is always available.
 * If another brand is disabled, falls back to Zvon.
 */
export const getBrand = (): BrandConfig => {
    // In Electron, default to Zvon
    if (typeof window !== 'undefined' && (window as any).electron) {
        return BRANDS.zvon;
    }

    if (typeof window === 'undefined') {
        return BRANDS.zvon;
    }

    const host = window.location.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
        return BRANDS.zvon;
    }

    // Check URL parameter override if present and brand is enabled
    try {
        const params = new URLSearchParams(window.location.search);
        const queryBrand = params.get('brand')?.toLowerCase();
        if (queryBrand && BRANDS[queryBrand] && BRANDS[queryBrand].enabled !== false && BRANDS[queryBrand].domainBehavior !== 'disabled') {
            return withZvonFallback(BRANDS[queryBrand]);
        }
    } catch { /* malformed query — proceed */ }

    // Match enabled brands by domain
    for (const [key, brand] of Object.entries(BRANDS)) {
        if (key !== 'zvon' && brand.enabled !== false && brand.domainBehavior !== 'disabled' && brand.domain && host.includes(brand.domain.toLowerCase())) {
            return withZvonFallback(brand);
        }
    }
    return BRANDS.zvon;
};

/**
 * Brand used ONLY for the app icon set + favicon. Normally follows getBrand(),
 * but a `?brand=maxcord` marker forces that icon set if enabled.
 */
export const getIconBrand = (): BrandConfig => {
    if (typeof window !== 'undefined' && (window as any).electron) {
        return BRANDS.zvon;
    }
    try {
        const params = new URLSearchParams(window.location.search);
        const forced = params.get('brand')?.toLowerCase();
        if (forced && BRANDS[forced] && BRANDS[forced].enabled !== false) {
            return BRANDS[forced];
        }
    } catch { /* malformed URL — fall through */ }
    return getBrand();
};

/**
 * Updates document title and favicon based on the current brand.
 */
export const applyBranding = () => {
    if (typeof document === 'undefined') return;
    const brand = getBrand();
    document.title = brand.name;

    const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    if (favicon && brand.favicon) {
        favicon.href = brand.favicon.startsWith('http') || brand.favicon.startsWith('/')
            ? brand.favicon
            : `/${brand.favicon}`;
    }

    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
    if (appleIcon && brand.favicon) {
        appleIcon.href = brand.favicon.startsWith('http') || brand.favicon.startsWith('/')
            ? brand.favicon
            : `/${brand.favicon}`;
    }
};

/**
 * Asynchronously synchronizes current brand and all public enabled brands from server
 */
export const fetchAndApplyBranding = async () => {
    if (typeof window === 'undefined') return;
    try {
        const [currentRes, publicRes] = await Promise.all([
            fetch('/api/branding/current').then(r => r.ok ? r.json() : null).catch(() => null),
            fetch('/api/branding/public').then(r => r.ok ? r.json() : null).catch(() => null)
        ]);

        if (Array.isArray(publicRes)) {
            publicRes.forEach(b => updateBrandInRegistry(b));
        }

        if (currentRes && currentRes.id) {
            updateBrandInRegistry(currentRes);
        }

        applyBranding();
    } catch (e) {
        // Fallback silently to client defaults
    }
};

/**
 * React hook to reactively subscribe to the active brand and its changes
 */
export const useCurrentBrand = (): BrandConfig => {
    const [brand, setBrand] = useState<BrandConfig>(() => getBrand());

    useEffect(() => {
        const handler = () => {
            setBrand(getBrand());
            applyBranding();
        };
        window.addEventListener('zvon-brand-updated', handler);
        return () => window.removeEventListener('zvon-brand-updated', handler);
    }, []);

    return brand;
};
