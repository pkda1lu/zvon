import React from 'react';

/*
 * Флаг страны картинкой. Эмодзи-флаги (региональные буквы) Windows не рисует —
 * в WebView2 вместо флага выходили буквы «RU». SVG из country-flag-icons:
 * в сборку попадает только таблица адресов, сам файл флага (сотни байт)
 * грузится, когда его показывают.
 */
const FLAGS = import.meta.glob('/node_modules/country-flag-icons/3x2/*.svg', {
    eager: true,
    query: '?url&no-inline',
    import: 'default',
}) as Record<string, string>;

const byCode: Record<string, string> = {};
for (const [path, url] of Object.entries(FLAGS)) {
    const code = path.slice(path.lastIndexOf('/') + 1, -'.svg'.length);
    byCode[code] = url;
}

interface Props {
    code?: string | null;
    title?: string;
}

const CountryFlag: React.FC<Props> = ({ code, title }) => {
    const url = code ? byCode[code.toUpperCase()] : undefined;
    if (!url) return <span className="country-flag country-flag--unknown" title={title || 'Страна неизвестна'} aria-hidden="true" />;
    return <img className="country-flag" src={url} alt={code!.toUpperCase()} title={title} loading="lazy" draggable={false} />;
};

export default CountryFlag;
