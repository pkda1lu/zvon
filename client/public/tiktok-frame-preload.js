/*
 * Предзагрузка, которая подключается ко ВСЕМ кадрам сессии на время работы
 * туннеля (session.setPreloads в tunnel.js), но что-либо делает только на
 * страницах TikTok — на остальных выходит сразу.
 *
 * Зачем: одностраничные приложения часто проверяют `window.top !== window.self`
 * и, обнаружив себя в рамке, просто ничего не рисуют — окно остаётся чёрным,
 * хотя страница загрузилась и сеть в порядке.
 *
 * Почему через webFrame.executeJavaScript, а не напрямую: в основном окне
 * включена изоляция контекстов, поэтому код предзагрузки живёт в отдельном
 * мире, и подмена свойств в нём страница бы не увидела. executeJavaScript
 * выполняет код в мире самой страницы, причём до её собственных скриптов.
 */

const { webFrame } = require('electron');

try {
    const host = (location && location.hostname) || '';
    const isTikTok = /(^|\.)tiktok\.com$/i.test(host) || /(^|\.)tiktokv\.com$/i.test(host);

    if (isTikTok && window.top !== window.self) {
        webFrame.executeJavaScript(`(function () {
            try {
                Object.defineProperty(window, 'top', { get: function () { return window; }, configurable: true });
                Object.defineProperty(window, 'parent', { get: function () { return window; }, configurable: true });
                Object.defineProperty(window, 'frameElement', { get: function () { return null; }, configurable: true });
            } catch (e) { /* страница могла запечатать свойства — тогда просто живём как есть */ }
        })();`);
    }
} catch (e) {
    /* Предзагрузка не имеет права ронять чужие кадры. */
}
