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
     * Демонстрация экрана. Список источников с превью и сам захват делает Rust
     * (capture.rs, Windows Graphics Capture); кадры приходят через общую
     * память WebView2 (sharedbufferreceived) и собираются в видеодорожку.
     */
    function getDesktopSources(options) {
        return invoke('get-desktop-sources', options || {});
    }

    var capture = null; // { session, writer, canvas, ctx, track }

    function onSharedBuffer(e) {
        var buf = e.getBuffer();
        try {
            var d = e.additionalData;
            if (!capture || !d || d.session !== capture.session) return;
            var frame = new VideoFrame(new Uint8Array(buf, 0, d.stride * d.height), {
                format: 'BGRA',
                codedWidth: d.width,
                codedHeight: d.height,
                timestamp: Math.round(performance.now() * 1000),
                layout: [{ offset: 0, stride: d.stride }]
            });
            if (capture.writer) {
                // Кодировщик не успевает — лучше пропустить кадр, чем копить очередь.
                if (capture.writer.desiredSize !== null && capture.writer.desiredSize <= 0) { frame.close(); return; }
                capture.writer.write(frame).catch(function () { try { frame.close(); } catch (_) { } });
            } else {
                if (capture.canvas.width !== d.width || capture.canvas.height !== d.height) {
                    capture.canvas.width = d.width; capture.canvas.height = d.height;
                }
                capture.ctx.drawImage(frame, 0, 0);
                frame.close();
            }
        } catch (err) {
            console.error('[zvon] кадр демонстрации:', err);
        } finally {
            window.chrome.webview.releaseBuffer(buf);
        }
    }

    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.addEventListener('sharedbufferreceived', onSharedBuffer);
    }

    function endCapture(notify) {
        var c = capture;
        if (!c) return;
        capture = null;
        try { if (c.writer) c.writer.close().catch(function () { }); } catch (_) { }
        call('ipc_invoke', { channel: 'capture:stop', args: [] }).catch(function () { });
        if (notify && c.track) {
            try { c.origStop.call(c.track); } catch (_) { }
            c.track.dispatchEvent(new Event('ended'));
        }
    }

    var endedSubscribed = false;

    function openCaptureStream(sourceId, opts) {
        var frameRate = (opts && opts.frameRate) || 30;
        endCapture(false);
        if (!endedSubscribed) {
            endedSubscribed = true;
            on('capture-ended', function (_e, session) {
                if (capture && capture.session === session) endCapture(true);
            });
        }

        var state = {};
        var track;
        if (typeof MediaStreamTrackGenerator === 'function') {
            var gen = new MediaStreamTrackGenerator({ kind: 'video' });
            state.writer = gen.writable.getWriter();
            track = gen;
        } else {
            state.canvas = document.createElement('canvas');
            state.canvas.width = 1280; state.canvas.height = 720;
            state.ctx = state.canvas.getContext('2d');
            track = state.canvas.captureStream(frameRate).getVideoTracks()[0];
        }
        state.track = track;
        state.origStop = track.stop;
        // Остановка дорожки интерфейсом (конец демонстрации) гасит и захват.
        track.stop = function () {
            state.origStop.call(track);
            if (capture === state) endCapture(false);
        };

        capture = state;
        return invoke('capture:start', sourceId, frameRate).then(function (session) {
            state.session = session;
            return new MediaStream([track]);
        }, function (err) {
            if (capture === state) capture = null;
            try { state.origStop.call(track); } catch (_) { }
            throw err;
        });
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
        openCaptureStream: openCaptureStream,
        setContentProtection: function (enabled) { return invoke('set-content-protection', enabled); }
    };

    // Боковые кнопки мыши в WebView2 листают историю — в Electron это
    // гасилось через app-command. Здесь то же самое на уровне страницы.
    window.addEventListener('mouseup', function (e) {
        if (e.button === 3 || e.button === 4) { e.preventDefault(); e.stopPropagation(); }
    }, true);
})();
