/*
 * window.electron поверх Tauri.
 *
 * Интерфейс Zvon общий для браузера и десктопа и узнаёт десктоп по наличию
 * window.electron (его раньше выставлял preload.js в Electron). Этот скрипт
 * выставляет объект той же формы, но каналы уходят в Rust: invoke — в команду
 * ipc_invoke, send — в ipc_send, on — в события Tauri с тем же именем канала.
 * Так ни один компонент не нужно переписывать под новую оболочку.
 *
 * Скрипт встраивается только в основной кадр окон Zvon. Мини-аппки в iframe
 * его не получают, а IPC для удалённых источников закрыт capability-файлом.
 */
(function () {
    'use strict';
    if (window.electron) return;

    /*
     * Транспорт IPC. Окна запущены с --disable-web-security (как Electron с
     * webSecurity: false), а с этим ключом Chromium не ставит заголовок Origin,
     * без которого Tauri отклоняет запросы к ipc.localhost. Отказ на уровне
     * fetch переключает Tauri на запасной транспорт postMessage — навсегда,
     * с первого же вызова.
     */
    var nativeFetch = window.fetch;
    window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.indexOf('http://ipc.localhost/') === 0 || url.indexOf('ipc://localhost/') === 0) {
            return Promise.reject(new TypeError('Zvon: IPC идёт через postMessage'));
        }
        return nativeFetch.apply(this, arguments);
    };

    var internals = function () { return window.__TAURI_INTERNALS__; };
    var tauri = function () { return window.__TAURI__; };
    var call = function (cmd, args) { return internals().invoke(cmd, args || {}); };

    // Каналы, которые обслуживаются прямо в шиме: поток звука идёт через
    // Channel (сырые байты), а не через события с JSON-массивами.
    var LOCAL = { 'audio-data-batch': true, 'audio-data': true, 'audio-meta': true };
    var local = {};
    var remote = {};

    var fakeEvent = { sender: null };

    function emitLocal(channel, payload) {
        var set = local[channel];
        if (!set) return;
        set.forEach(function (fn) {
            try { fn(fakeEvent, payload); } catch (e) { console.error('[zvon] обработчик', channel, e); }
        });
    }

    function on(channel, fn) {
        if (LOCAL[channel]) {
            (local[channel] = local[channel] || new Set()).add(fn);
            return function () { local[channel] && local[channel].delete(fn); };
        }

        var entry = { removed: false, unlisten: null };
        (remote[channel] = remote[channel] || new Set()).add(entry);

        var current = tauri().webviewWindow.getCurrentWebviewWindow();
        current.listen(channel, function (e) {
            if (!entry.removed) fn(fakeEvent, e.payload);
        }).then(function (unlisten) {
            if (entry.removed) { unlisten(); return; }
            entry.unlisten = unlisten;
            // Значение, отправленное до того, как интерфейс успел подписаться
            // (например, настройки оверлея сразу после создания окна).
            call('ipc_invoke', { channel: '__sticky', args: [channel] }).then(function (v) {
                if (v !== null && v !== undefined && !entry.removed) fn(fakeEvent, v);
            }).catch(function () { });
        });

        return function () {
            if (entry.removed) return;
            entry.removed = true;
            if (entry.unlisten) entry.unlisten();
            remote[channel] && remote[channel].delete(entry);
        };
    }

    function removeAllListeners(channel) {
        if (LOCAL[channel]) { delete local[channel]; return; }
        var set = remote[channel];
        if (!set) return;
        set.forEach(function (entry) {
            entry.removed = true;
            if (entry.unlisten) entry.unlisten();
        });
        delete remote[channel];
    }

    function startAudioCapture(opts) {
        var Channel = tauri().core.Channel;
        var ch = new Channel();
        // Отсчёты приходят строкой base64 (через postMessage так дешевле, чем
        // массив чисел), сведения о формате — объектом.
        ch.onmessage = function (msg) {
            if (typeof msg === 'string') {
                var bin = atob(msg);
                var bytes = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                emitLocal('audio-data-batch', bytes);
            } else if (msg instanceof ArrayBuffer) {
                emitLocal('audio-data-batch', new Uint8Array(msg));
            } else {
                emitLocal('audio-meta', msg);
            }
        };
        call('audio_start', { pid: (opts && opts.pid) || 0, mode: (opts && opts.mode) || 0, onData: ch })
            .catch(function (e) { console.error('[zvon] захват звука не запущен:', e); });
    }

    function invoke(channel) {
        var args = Array.prototype.slice.call(arguments, 1);
        return call('ipc_invoke', { channel: channel, args: args });
    }

    function send(channel) {
        var args = Array.prototype.slice.call(arguments, 1);
        if (channel === 'start-audio-capture') { startAudioCapture(args[0]); return; }
        call('ipc_send', { channel: channel, args: args }).catch(function (e) {
            console.warn('[zvon] ipc_send', channel, e);
        });
    }

    /*
     * Выбор источника демонстрации. WebView2 не умеет открыть поток по
     * chromeMediaSourceId, поэтому вместо списка окон отдаём два источника:
     * «экран» и «окно». Сам выбор делает системный пикер getDisplayMedia,
     * а по метке дорожки потом находим окно для захвата его звука.
     */
    function sourceTile(label) {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="85" viewBox="0 0 150 85">' +
            '<rect width="150" height="85" rx="8" fill="#1e1f22"/>' +
            '<rect x="45" y="20" width="60" height="38" rx="4" fill="none" stroke="#8b8cf8" stroke-width="3"/>' +
            '<rect x="68" y="60" width="14" height="6" fill="#8b8cf8"/>' +
            '<text x="75" y="80" font-family="Segoe UI, sans-serif" font-size="9" fill="#b5bac1" text-anchor="middle">' + label + '</text></svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    function getDesktopSources(options) {
        var types = (options && options.types) || ['screen'];
        var list = [];
        if (types.indexOf('screen') !== -1) {
            list.push({ id: 'tauri:monitor', name: 'Выбрать экран…', thumbnail: sourceTile('Экран'), display_id: '', appIcon: null });
        }
        if (types.indexOf('window') !== -1) {
            list.push({ id: 'tauri:window', name: 'Выбрать окно…', thumbnail: sourceTile('Окно'), display_id: '', appIcon: null });
        }
        return Promise.resolve(list);
    }

    window.electron = {
        isElectron: true,
        isTauri: true,
        platform: 'win32',
        ipc: { invoke: invoke, on: on, send: send, removeAllListeners: removeAllListeners },
        clipboard: { writeText: function (text) { send('clipboard-write', text); } },
        util: { openExternal: function (url) { send('open-external-url', url); } },
        getCurrentActivity: function () { return invoke('get-current-activity'); },
        onActivityChanged: function (cb) { return on('activity-changed', function (_e, a) { cb(a); }); },
        windowControls: {
            minimize: function () { send('window-minimize'); },
            maximize: function () { send('window-maximize'); },
            close: function () { send('window-close'); }
        },
        getDesktopSources: getDesktopSources,
        setContentProtection: function (enabled) { return invoke('set-content-protection', enabled); }
    };

    // Боковые кнопки мыши в WebView2 листают историю — в Electron это
    // гасилось через app-command. Здесь то же самое на уровне страницы.
    window.addEventListener('mouseup', function (e) {
        if (e.button === 3 || e.button === 4) { e.preventDefault(); e.stopPropagation(); }
    }, true);
})();
