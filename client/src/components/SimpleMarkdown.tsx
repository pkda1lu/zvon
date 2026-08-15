import React from 'react';

/**
 * Минимальный рендерер Markdown под юридические документы.
 *
 * Своя реализация вместо библиотеки по двум причинам: нужен небольшой и
 * предсказуемый набор конструкций (заголовки, абзацы, таблицы, списки,
 * выделение, разделители), и не хочется тянуть зависимость ради одной страницы,
 * которую и так грузим лениво.
 *
 * Безопасность: строится дерево React-элементов, dangerouslySetInnerHTML не
 * используется нигде. Даже если в документ попадёт разметка, она отрисуется
 * текстом, а не выполнится.
 */

/** Разбирает **жирный** и `код` внутри строки. */
const renderInline = (text: string, keyPrefix: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    // Один проход по обоим шаблонам, чтобы не делать вложенных замен.
    const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;

    while ((m = re.exec(text)) !== null) {
        if (m.index > last) nodes.push(text.slice(last, m.index));
        const token = m[0];
        if (token.startsWith('**')) {
            nodes.push(<strong key={`${keyPrefix}-b${i++}`}>{token.slice(2, -2)}</strong>);
        } else {
            nodes.push(<code key={`${keyPrefix}-c${i++}`} className="md-code">{token.slice(1, -1)}</code>);
        }
        last = m.index + token.length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
};

const splitRow = (line: string): string[] =>
    line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());

const SimpleMarkdown: React.FC<{ text: string }> = ({ text }) => {
    const lines = text.split('\n');
    const blocks: React.ReactNode[] = [];

    let paragraph: string[] = [];
    let listItems: string[] = [];

    const flushParagraph = () => {
        if (!paragraph.length) return;
        const content = paragraph.join(' ');
        blocks.push(<p key={`p${blocks.length}`} className="md-p">{renderInline(content, `p${blocks.length}`)}</p>);
        paragraph = [];
    };

    const flushList = () => {
        if (!listItems.length) return;
        blocks.push(
            <ul key={`ul${blocks.length}`} className="md-ul">
                {listItems.map((li, i) => <li key={i}>{renderInline(li, `li${blocks.length}-${i}`)}</li>)}
            </ul>
        );
        listItems = [];
    };

    const flushAll = () => { flushParagraph(); flushList(); };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) { flushAll(); continue; }

        // Заголовки
        const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
        if (heading) {
            flushAll();
            const level = heading[1].length;
            const content = renderInline(heading[2], `h${blocks.length}`);
            const cls = `md-h${level}`;
            blocks.push(
                level === 1 ? <h1 key={blocks.length} className={cls}>{content}</h1>
                    : level === 2 ? <h2 key={blocks.length} className={cls}>{content}</h2>
                        : level === 3 ? <h3 key={blocks.length} className={cls}>{content}</h3>
                            : <h4 key={blocks.length} className={cls}>{content}</h4>
            );
            continue;
        }

        // Горизонтальный разделитель
        if (/^-{3,}$/.test(trimmed)) {
            flushAll();
            blocks.push(<hr key={blocks.length} className="md-hr" />);
            continue;
        }

        // Таблица: строка заголовка, следующая — разделитель из дефисов.
        if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
            flushAll();
            const headers = splitRow(trimmed);
            const rows: string[][] = [];
            i += 2; // пропускаем строку-разделитель
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                rows.push(splitRow(lines[i].trim()));
                i++;
            }
            i--; // компенсируем инкремент внешнего цикла
            blocks.push(
                <div key={blocks.length} className="md-table-wrap">
                    <table className="md-table">
                        <thead>
                            <tr>{headers.map((h, hi) => <th key={hi}>{renderInline(h, `th${hi}`)}</th>)}</tr>
                        </thead>
                        <tbody>
                            {rows.map((r, ri) => (
                                <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c, `td${ri}-${ci}`)}</td>)}</tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            continue;
        }

        // Элемент списка
        const li = trimmed.match(/^[-*]\s+(.*)$/);
        if (li) {
            flushParagraph();
            listItems.push(li[1]);
            continue;
        }

        flushList();
        paragraph.push(trimmed);
    }

    flushAll();

    return <div className="md-root">{blocks}</div>;
};

export default SimpleMarkdown;
