export interface DeviceScaleConfig {
    interfaceScale: number;
    pageScales: {
        scaleMode?: 'global' | 'separate';
        sidebar?: number;
        chat?: number;
        members?: number;
        settings?: number;
    };
}

export type DeviceScalesMap = Record<string, DeviceScaleConfig>;

/**
 * Returns a stable device key for scaling configuration.
 * Local device (localStorage `zvon_device_id`) or environment fallback ('exe' / 'web').
 */
export const getDeviceIdKey = (): string => {
    try {
        const storedDeviceId = localStorage.getItem('zvon_device_id');
        if (storedDeviceId) {
            return `device_${storedDeviceId}`;
        }
    } catch {
        // localStorage unavailable
    }

    const isElectron = !!(window as any).electron;
    return isElectron ? 'exe' : 'web';
};

/**
 * Returns user-friendly label for device key (or device type).
 */
export const getDeviceLabel = (key: string): string => {
    if (key === 'exe') return 'Приложение (Desktop / EXE)';
    if (key === 'web') return 'Браузер (Web)';
    if (key.startsWith('device_')) {
        const isElectron = !!(window as any).electron;
        const shortId = key.replace('device_', '').slice(0, 6);
        return isElectron ? `Текущий ПК (EXE · ${shortId})` : `Текущее устройство (Web · ${shortId})`;
    }
    return key;
};
