export const AWARD_PALETTES = {
    graphite: { label: 'Графит', body: '#242630', metal: '#e1e6f0', mark: '#f0f2fa', accent: '#a4a9bd' },
    cobalt: { label: 'Кобальт', body: '#17479e', metal: '#c2dcff', mark: '#ecf4ff', accent: '#68b8ff' },
    aurora: { label: 'Аврора', body: '#145747', metal: '#acedd8', mark: '#e5fff4', accent: '#65edbc' },
    rose: { label: 'Розовый кварц', body: '#804052', metal: '#f0b9c9', mark: '#fff0f5', accent: '#ffa4cb' },
    amber: { label: 'Янтарь', body: '#664124', metal: '#f0cb84', mark: '#fff0c8', accent: '#ffca67' },
    amethyst: { label: 'Аметист', body: '#533186', metal: '#d0b3fc', mark: '#f5ebff', accent: '#c294ff' },
    ruby: { label: 'Рубин', body: '#8c1d3b', metal: '#ffb1c4', mark: '#fff0f3', accent: '#ff517d' },
    ice: { label: 'Ледник', body: '#367083', metal: '#ccf5ff', mark: '#f3fdff', accent: '#8fe9ff' },
    copper: { label: 'Медь', body: '#86432e', metal: '#edaf89', mark: '#fff0df', accent: '#ff985a' },
    lime: { label: 'Лайм', body: '#4b6129', metal: '#d7ef9c', mark: '#f7ffda', accent: '#c7f564' },
    obsidian: { label: 'Обсидиан', body: '#101018', metal: '#777b98', mark: '#e0e3f5', accent: '#bc9aff' },
    porcelain: { label: 'Фарфор', body: '#a5acc0', metal: '#e7edf9', mark: '#fffaff', accent: '#aabfff' }
};
export const AWARD_BACKGROUNDS = {
    midnight: { label: 'Полночь', top: '#343c61', bottom: '#141726', ink: '#a4b6ec' },
    ocean: { label: 'Глубина', top: '#236782', bottom: '#122b4d', ink: '#8fe4ed' },
    forest: { label: 'Изумруд', top: '#346c60', bottom: '#172e36', ink: '#a4ead2' },
    sunset: { label: 'Закат', top: '#a46c64', bottom: '#50334f', ink: '#ffcdad' },
    nebula: { label: 'Туманность', top: '#7258a4', bottom: '#302750', ink: '#dac3ff' },
    pearl: { label: 'Жемчуг', top: '#8a92a8', bottom: '#424961', ink: '#eef2ff' },
    cherry: { label: 'Вишня', top: '#9c436b', bottom: '#401a3f', ink: '#ffb4d4' },
    glacier: { label: 'Ледяное небо', top: '#5e9eb6', bottom: '#294963', ink: '#d3f7ff' },
    sand: { label: 'Дюны', top: '#b58b59', bottom: '#695038', ink: '#ffe4b6' },
    lagoon: { label: 'Лагуна', top: '#398f90', bottom: '#144950', ink: '#b7fff1' },
    eclipse: { label: 'Затмение', top: '#404052', bottom: '#151420', ink: '#bfb3e3' },
    lavender: { label: 'Лаванда', top: '#9e83ba', bottom: '#564271', ink: '#f0dbff' }
};
export const AWARD_PATTERNS = { signal: 'Звуковые волны', stars: 'Искры', orbits: 'Орбиты', zvon: 'Монограмма Z', diamonds: 'Грани', waves: 'Прибой', lightning: 'Молнии', constellation: 'Созвездия' };
export const AWARD_FINISHES = { polished: 'Полированный', satin: 'Сатиновый', frosted: 'Матовый', ceramic: 'Керамика', brushed: 'Шлифованный' };
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
