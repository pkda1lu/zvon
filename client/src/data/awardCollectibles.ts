export const AWARD_PALETTES = {
    graphite: { label: 'Графит', body: '#242630', metal: '#e1e6f0', mark: '#f0f2fa', accent: '#a4a9bd' },
    cobalt: { label: 'Кобальт', body: '#17479e', metal: '#c2dcff', mark: '#ecf4ff', accent: '#68b8ff' },
    aurora: { label: 'Аврора', body: '#145747', metal: '#acedd8', mark: '#e5fff4', accent: '#65edbc' },
    rose: { label: 'Розовый кварц', body: '#804052', metal: '#f0b9c9', mark: '#fff0f5', accent: '#ffa4cb' },
    amber: { label: 'Янтарь', body: '#664124', metal: '#f0cb84', mark: '#fff0c8', accent: '#ffca67' },
    amethyst: { label: 'Аметист', body: '#533186', metal: '#d0b3fc', mark: '#f5ebff', accent: '#c294ff' }
};
export const AWARD_BACKGROUNDS = {
    midnight: { label: 'Полночь', top: '#343c61', bottom: '#141726', ink: '#a4b6ec' },
    ocean: { label: 'Глубина', top: '#236782', bottom: '#122b4d', ink: '#8fe4ed' },
    forest: { label: 'Изумруд', top: '#346c60', bottom: '#172e36', ink: '#a4ead2' },
    sunset: { label: 'Закат', top: '#a46c64', bottom: '#50334f', ink: '#ffcdad' },
    nebula: { label: 'Туманность', top: '#7258a4', bottom: '#302750', ink: '#dac3ff' },
    pearl: { label: 'Жемчуг', top: '#8a92a8', bottom: '#424961', ink: '#eef2ff' }
};
export const AWARD_PATTERNS = { signal: 'Звуковые волны', stars: 'Искры', orbits: 'Орбиты', zvon: 'Монограмма Z' };
export const AWARD_FINISHES = { polished: 'Полированный', satin: 'Сатиновый', frosted: 'Матовый' };
export interface CollectibleTraits {
    palette: keyof typeof AWARD_PALETTES;
    background: keyof typeof AWARD_BACKGROUNDS;
    pattern: keyof typeof AWARD_PATTERNS;
    finish: keyof typeof AWARD_FINISHES;
}
export type AppearanceSettings = { [K in keyof CollectibleTraits]: CollectibleTraits[K] | 'random' };
export const RANDOM_APPEARANCE: AppearanceSettings = { palette: 'random', background: 'random', pattern: 'random', finish: 'random' };
export const DEFAULT_COLLECTIBLE: CollectibleTraits = { palette: 'graphite', background: 'midnight', pattern: 'signal', finish: 'polished' };
export function previewTraits(settings?: AppearanceSettings, sample = 0): CollectibleTraits {
    const options = { palette: Object.keys(AWARD_PALETTES), background: Object.keys(AWARD_BACKGROUNDS), pattern: Object.keys(AWARD_PATTERNS), finish: Object.keys(AWARD_FINISHES) };
    return Object.fromEntries(Object.entries(options).map(([key, values], index) => {
        const selected = settings?.[key as keyof AppearanceSettings];
        return [key, selected && selected !== 'random' ? selected : values[(sample + index) % values.length]];
    })) as unknown as CollectibleTraits;
}
