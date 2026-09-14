/**
 * Карточка мини-приложения, нарисованная на canvas.
 *
 * Используется 3D-комнатой: presence, который в обычном голосовом канале
 * рисуется плиткой в сетке участников (PresenceTile), в комнате попадает на
 * экран северной стены как «эфир».
 *
 * Почему canvas, а не DOM поверх сцены: карточка должна висеть НА стене —
 * поворачиваться вместе с комнатой, отдаляться, ловить перспективу. HTML-слой
 * поверх канваса остался бы плоским прямоугольником на экране и разрушил бы
 * ощущение, что эфир идёт в помещении.
 *
 * Вместе с картинкой функция возвращает хит-боксы кнопок в координатах полотна:
 * сцена raycast-ом получает UV точки на экране, переводит в эти координаты и
 * понимает, по какой кнопке кликнули. Иначе кнопки на стене были бы картинкой
 * без нажатий.
 *
 * Отрисовка вынесена из Room3DView отдельным модулем, чтобы её можно было
 * проверять без three.js и без сцены.
 */

/** Разрешение полотна. 16:9 — под пропорции экрана на стене. */
export const CARD_W = 1024;
export const CARD_H = 576;

export interface PresenceControlSpec {
    id: string;
    kind?: string;
    label?: string;
    tooltip?: string;
    style?: string;
    value?: number;
    min?: number;
    max?: number;
}

export interface PresenceCardData {
    displayName?: string | null;
    subtitle?: string | null;
    accentColor?: string | null;
    background?: { type: 'image' | 'color' | 'video'; url?: string; color?: string } | null;
    controls?: PresenceControlSpec[] | null;
}

export interface PresenceCardImages {
    bg?: HTMLImageElement;
    avatar?: HTMLImageElement;
}

/** Область нажатия в координатах полотна (0..CARD_W, 0..CARD_H). */
export interface PresenceCardHit {
    id: string;
    kind: 'button' | 'slider';
    x: number;
    y: number;
    w: number;
    h: number;
    min?: number;
    max?: number;
}

export interface PresenceCardResult {
    canvas: HTMLCanvasElement;
    hits: PresenceCardHit[];
}

const DEFAULT_ACCENT = '#00e5ff';

/**
 * Цвет из presence приходит от стороннего мини-приложения, то есть это чужой
 * ввод. Пропускаем только hex — иначе строка вида `red; ...` попала бы прямо в
 * контекст рисования.
 */
const safeAccent = (value: string | null | undefined) =>
    (value && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim())) ? value.trim() : DEFAULT_ACCENT;

/**
 * Обрезает строку по РЕАЛЬНОЙ ширине, а не по числу символов.
 *
 * Счёт символов здесь не работает: имя мини-приложения задаёт сторонний
 * разработчик, и «Очень длинное имя» из широких букв уезжает за край полотна,
 * укладываясь при этом в лимит символов. Меряем и отрезаем, пока не влезет.
 */
const clipToWidth = (g: CanvasRenderingContext2D, text: string, maxWidth: number) => {
    if (g.measureText(text).width <= maxWidth) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (g.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid;
        else hi = mid - 1;
    }
    return text.slice(0, lo).trimEnd() + '…';
};

/**
 * Строка, описывающая всё, что влияет на картинку.
 *
 * Нужна, чтобы не перерисовывать полотно на каждое обновление presence: плеер
 * шлёт их часто (позиция трека), а большая часть полей при этом не меняется.
 * Перерисовка стоит новой текстуры, а замена текстуры на стене видна как рывок.
 */
export const presenceCardSignature = (p: PresenceCardData): string => JSON.stringify([
    p.displayName ?? '',
    p.subtitle ?? '',
    p.accentColor ?? '',
    p.background?.type ?? '', p.background?.url ?? '', p.background?.color ?? '',
    (p.controls || []).map(c => [c.id, c.kind ?? '', c.label ?? '', c.style ?? '', c.value ?? '', c.min ?? '', c.max ?? '']),
]);

const BAR_Y = 470;          // верх панели управления
const BTN_R = 30;           // радиус круглой кнопки
const BTN_GAP = 22;
const SIDE = 64;            // поле слева/справа, общее с текстом

/** Есть ли у контрола известная иконка плеера — от этого зависит форма кнопки. */
const isIconControl = (ctrl: PresenceControlSpec) => {
    const label = (ctrl.label || '').trim();
    return ctrl.id === 'play-pause' || ctrl.id === 'prev' || ctrl.id === 'next'
        || label === '▶' || label === '⏸' || label === '⏮' || label === '⏭';
};

/** Рисует иконку плеера по id/лейблу. Возвращает false, если иконка неизвестна. */
const drawControlIcon = (g: CanvasRenderingContext2D, ctrl: PresenceControlSpec, cx: number, cy: number) => {
    const label = (ctrl.label || '').trim();
    const tri = (dir: 1 | -1, ox: number, s: number) => {
        g.beginPath();
        g.moveTo(cx + ox + dir * s, cy);
        g.lineTo(cx + ox - dir * s, cy - s);
        g.lineTo(cx + ox - dir * s, cy + s);
        g.closePath();
        g.fill();
    };
    const bar = (ox: number, w: number, h: number) => g.fillRect(cx + ox - w / 2, cy - h / 2, w, h);

    const isPlay = ctrl.id === 'play-pause' ? label === '▶' : label === '▶';
    const isPause = label === '⏸';

    if (ctrl.id === 'play-pause' || isPlay || isPause) {
        if (isPlay) tri(1, 2, 11);
        else { bar(-6, 5, 22); bar(6, 5, 22); }
        return true;
    }
    if (ctrl.id === 'prev' || label === '⏮') { bar(-10, 4, 22); tri(-1, 3, 10); return true; }
    if (ctrl.id === 'next' || label === '⏭') { bar(10, 4, 22); tri(1, -3, 10); return true; }
    return false;
};

/**
 * Рисует карточку и возвращает полотно вместе с хит-боксами кнопок.
 * Картинки необязательны: если фон или аватар не загрузились, карточка всё
 * равно читается — остаются градиент и текст.
 */
export const drawPresenceCard = (
    presence: PresenceCardData,
    images: PresenceCardImages = {},
): PresenceCardResult | null => {
    const cv = document.createElement('canvas');
    cv.width = CARD_W;
    cv.height = CARD_H;
    const g = cv.getContext('2d');
    if (!g) return null;

    const accent = safeAccent(presence.accentColor);
    const bg = presence.background;
    const hits: PresenceCardHit[] = [];

    // Подложка: картинка, свой цвет или тёмный градиент по умолчанию.
    if (images.bg) {
        // cover: картинка закрывает полотно целиком, пропорции сохраняются.
        const scale = Math.max(CARD_W / images.bg.width, CARD_H / images.bg.height);
        const w = images.bg.width * scale;
        const h = images.bg.height * scale;
        g.drawImage(images.bg, (CARD_W - w) / 2, (CARD_H - h) / 2, w, h);
        // Затемнение: поверх произвольной картинки белый текст иначе теряется.
        g.fillStyle = 'rgba(5, 7, 11, 0.55)';
        g.fillRect(0, 0, CARD_W, CARD_H);
    } else if (bg && bg.type === 'color' && bg.color) {
        g.fillStyle = bg.color;
        g.fillRect(0, 0, CARD_W, CARD_H);
    } else {
        const grad = g.createLinearGradient(0, 0, CARD_W, CARD_H);
        grad.addColorStop(0, '#12122f');
        grad.addColorStop(1, '#05050c');
        g.fillStyle = grad;
        g.fillRect(0, 0, CARD_W, CARD_H);
    }

    // Метка эфира — сразу видно, что это не статичная картинка на стене.
    g.fillStyle = accent;
    g.beginPath();
    g.arc(SIDE, 62, 10, 0, Math.PI * 2);
    g.fill();
    g.font = '700 26px Outfit, system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('В ЭФИРЕ', SIDE + 24, 63);

    // Аватар мини-аппы — круглая иконка слева от названия.
    const AV = 120;
    const avY = 250 - AV / 2;
    if (images.avatar) {
        g.save();
        g.beginPath();
        g.arc(SIDE + AV / 2, avY + AV / 2, AV / 2, 0, Math.PI * 2);
        g.clip();
        g.drawImage(images.avatar, SIDE, avY, AV, AV);
        g.restore();
        g.strokeStyle = accent;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(SIDE + AV / 2, avY + AV / 2, AV / 2, 0, Math.PI * 2);
        g.stroke();
    }

    const textX = images.avatar ? SIDE + AV + 32 : SIDE;
    // Правое поле такое же, как левое, — текст не должен доходить до кромки.
    const textMax = CARD_W - textX - SIDE;
    const hasSubtitle = Boolean(presence.subtitle);

    g.fillStyle = '#ffffff';
    g.font = '800 54px Outfit, system-ui, sans-serif';
    g.fillText(
        clipToWidth(g, String(presence.displayName || 'Мини-приложение'), textMax),
        textX,
        hasSubtitle ? 232 : 250,
    );

    if (hasSubtitle) {
        g.fillStyle = 'rgba(255, 255, 255, 0.62)';
        g.font = '500 32px Outfit, system-ui, sans-serif';
        g.fillText(clipToWidth(g, String(presence.subtitle), textMax), textX, 286);
    }

    // ===== Панель управления =====
    // Те же контролы, что мини-аппка показывает в обычном голосовом канале
    // (PresenceTile). Ползунок — отдельной строкой над кнопками: на стене он
    // длинный и попасть по нему проще, чем по кнопке.
    const controls = (presence.controls || []).filter(c => c && c.id);
    const slider = controls.find(c => c.kind === 'slider');
    const buttons = controls.filter(c => c.kind !== 'slider');

    if (slider) {
        const min = slider.min ?? 0;
        const max = slider.max ?? 100;
        const value = Math.min(Math.max(slider.value ?? min, min), max);
        const pct = max > min ? (value - min) / (max - min) : 0;
        const trackX = SIDE;
        const trackW = CARD_W - SIDE * 2;
        const trackY = BAR_Y - 4;
        const trackH = 8;

        g.fillStyle = 'rgba(255, 255, 255, 0.18)';
        g.beginPath();
        g.roundRect(trackX, trackY, trackW, trackH, trackH / 2);
        g.fill();

        g.fillStyle = accent;
        g.beginPath();
        g.roundRect(trackX, trackY, Math.max(trackW * pct, trackH), trackH, trackH / 2);
        g.fill();

        g.beginPath();
        g.arc(trackX + trackW * pct, trackY + trackH / 2, 11, 0, Math.PI * 2);
        g.fill();

        // Полоса тонкая, поэтому область нажатия заметно выше самой дорожки:
        // на стене, да ещё под углом, попасть в 8 пикселей невозможно.
        hits.push({ id: slider.id, kind: 'slider', x: trackX, y: trackY - 26, w: trackW, h: trackH + 52, min, max });
    }

    if (buttons.length > 0) {
        // Ширина у кнопок разная: иконка укладывается в круг, а подпись вроде
        // «Пропустить» — нет. Раньше все кнопки были кругами, и текстовые
        // обрезались до «Пр…». Поэтому сначала меряем, потом раскладываем.
        g.font = '700 22px Outfit, system-ui, sans-serif';
        const laid = buttons.map(ctrl => {
            const hasIcon = isIconControl(ctrl);
            const label = String(ctrl.label || ctrl.id);
            const w = hasIcon
                ? BTN_R * 2
                : Math.min(Math.max(g.measureText(label).width + 44, BTN_R * 2), CARD_W - SIDE * 2);
            return { ctrl, hasIcon, label, w };
        });

        const total = laid.reduce((acc, b) => acc + b.w, 0) + (laid.length - 1) * BTN_GAP;
        let x = (CARD_W - total) / 2;
        const y = BAR_Y + 62;

        for (const b of laid) {
            const isAccent = b.ctrl.style === 'primary' || b.ctrl.id === 'play-pause';

            g.fillStyle = isAccent ? accent : 'rgba(255, 255, 255, 0.10)';
            g.beginPath();
            g.roundRect(x, y - BTN_R, b.w, BTN_R * 2, BTN_R);
            g.fill();
            g.strokeStyle = isAccent ? 'rgba(255, 255, 255, 0.30)' : 'rgba(255, 255, 255, 0.22)';
            g.lineWidth = 2;
            g.stroke();

            g.fillStyle = isAccent ? '#05050c' : '#ffffff';
            if (b.hasIcon) {
                drawControlIcon(g, b.ctrl, x + b.w / 2, y);
            } else {
                g.font = '700 22px Outfit, system-ui, sans-serif';
                g.textAlign = 'center';
                g.fillText(clipToWidth(g, b.label, b.w - 24), x + b.w / 2, y);
                g.textAlign = 'left';
            }

            hits.push({ id: b.ctrl.id, kind: 'button', x, y: y - BTN_R, w: b.w, h: BTN_R * 2 });
            x += b.w + BTN_GAP;
        }
    }

    return { canvas: cv, hits };
};
