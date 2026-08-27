
export interface AppIconOption {
    id: string;
    label: string;
    img: string;
}

export interface BrandConfig {
    id: 'zvon' | 'maxcord';
    name: string;
    logo: string;
    favicon: string;
    appIcons: AppIconOption[];
}

export const BRANDS: Record<'zvon' | 'maxcord', BrandConfig> = {
    zvon: {
        id: 'zvon',
        name: 'Zvon',
        logo: 'zvonlogonew.png',
        favicon: 'icon.png',
        appIcons: [
            { id: 'default', label: 'Стандарт', img: 'icon.png' },
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
        appIcons: [
            { id: 'max_default', label: 'Градиент', img: 'maxcord/logo.png' },
            { id: 'max_white', label: 'Белый', img: 'maxcord/logo-trans.png' },
        ]
    }

};

export const getBrand = (): BrandConfig => {
    // In Electron, we might want to default to Zvon or allow configuration
    if ((window as any).electron) {
        return BRANDS.zvon;
    }

    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
        return BRANDS.zvon;
    }
    if (host.includes('maxcord.fun')) {
        return BRANDS.maxcord;
    }
    return BRANDS.zvon;
};

/**
 * Brand used ONLY for the app icon set + favicon. Normally follows getBrand(),
 * but a `?brand=maxcord` marker in the URL forces the MAXCORD icon set while the
 * rest of the app (name, logo, landing, emails) stays on the host brand.
 *
 * This powers the maxcord.fun → zvonserver.ru redirect (see index.html): users
 * land on the shared Zvon deployment but keep MAXCORD icons. Marker-only, not
 * sticky — drop `?brand=maxcord` and it reverts to the host brand.
 */
export const getIconBrand = (): BrandConfig => {
    if ((window as any).electron) {
        return BRANDS.zvon;
    }
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('brand') === 'maxcord') {
            return BRANDS.maxcord;
        }
    } catch { /* malformed URL — fall through */ }
    return getBrand();
};

/**
 * Updates document title and favicon based on the current brand.
 * Should be called once at app initialization.
 */
export const applyBranding = () => {
    const brand = getBrand();
    document.title = brand.name;

    const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    if (favicon) {
        favicon.href = `/${brand.favicon}`;
    }

    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement;
    if (appleIcon) {
        appleIcon.href = `/${brand.favicon}`;
    }
};
