import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';

/*
 * Голосовая активация: гейт на исходящем треке микрофона.
 *
 * Раньше «чувствительность» и «автоматически определять» влияли только на
 * подсветку «говорит» в интерфейсе, а микрофон передавался всегда — вместе с
 * клавиатурой, вентилятором и дыханием. Теперь звук в эфир проходит, только
 * когда детектор решил, что говорят.
 *
 * Детектор (VoiceDetector) один на два места: гейт в цепочке микрофона и
 * индикатор уровня (VAD в VoiceContext, в том числе тест в настройках), чтобы
 * то, что человек видит в настройках, совпадало с тем, что слышат другие.
 *
 * Режимы:
 *  • ручной — порог с ползунка по полному уровню сигнала (тот же, что на
 *    индикаторе);
 *  • автоматический — детектор сам следит за уровнем фонового шума и ставит
 *    порог выше него с запасом. Уровень меряется в полосе речи (200–4000 Гц),
 *    поэтому гул, низкочастотный фон и шипение гейт не открывают. Уровень
 *    шума — минимум за последние ~1,5 с: в речи между слогами есть провалы до
 *    фона, у постоянного шума их нет. Так оценка догоняет новый шум (включили
 *    вентилятор) даже при открытом гейте и не застревает в «открыто».
 *
 * Против обрезанных начал слов — упреждение 20 мс (звук задерживается, решение
 * принимается по текущему); против щелчков клавиатуры — атака подтверждается
 * 15 мс; после речи гейт держится открытым 350 мс.
 */

export interface VoiceGateConfig {
    auto: boolean;
    /** Порог ручного режима, дБ полной шкалы. */
    thresholdDb: number;
}

let config: VoiceGateConfig = { auto: true, thresholdDb: -50 };
const liveNodes = new Set<AudioWorkletNode>();

/** Новые настройки — сразу во все живые гейты и индикаторы, без пересборки. */
export const setVoiceGateConfig = (next: VoiceGateConfig) => {
    config = { auto: !!next.auto, thresholdDb: Number(next.thresholdDb) };
    liveNodes.forEach(n => { try { n.port.postMessage({ type: 'config', ...config }); } catch { /* узел закрыт */ } });
};

export const registerVoiceGateNode = (node: AudioWorkletNode) => {
    liveNodes.add(node);
    node.port.postMessage({ type: 'config', ...config });
    return () => { liveNodes.delete(node); };
};

/** Исходник детектора — вставляется в код ворклетов (у них нет import). */
export const VOICE_DETECTOR_SOURCE = `
class ZvonBiquad {
    constructor(type, freq, sr) {
        const w = 2 * Math.PI * freq / sr, c = Math.cos(w), s = Math.sin(w), q = Math.SQRT1_2;
        const a = s / (2 * q);
        let b0, b1, b2;
        if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
        else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
        const a0 = 1 + a;
        this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
        this.a1 = -2 * c / a0; this.a2 = (1 - a) / a0;
        this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
    }
    step(x) {
        const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
        this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
        return y;
    }
}

class VoiceDetector {
    constructor(sr) {
        // Два ФВЧ подряд — крутой срез: сетевой гул 50/60 Гц не попадает в полосу речи.
        this.hp = new ZvonBiquad('hp', 220, sr);
        this.hp2 = new ZvonBiquad('hp', 220, sr);
        this.lp = new ZvonBiquad('lp', 4000, sr);
        this.env = -100;
        this.mins = new Array(6).fill(0);
        this.subMin = 0;
        this.subTime = 0;
        this.warm = true;
        this.sr = sr;
        this.auto = true;
        this.manual = -50;
        this.floor = -60;
        this.open = false;
        this.hold = 0;
        this.above = 0;
        this.db = -100;
        this.threshold = -48;
    }
    setConfig(c) {
        this.auto = !!c.auto;
        if (typeof c.thresholdDb === 'number' && isFinite(c.thresholdDb)) this.manual = c.thresholdDb;
    }
    analyze(samples) {
        const n = samples.length;
        if (!n) return;
        let full = 0, band = 0;
        for (let i = 0; i < n; i++) {
            const x = samples[i];
            full += x * x;
            const y = this.lp.step(this.hp2.step(this.hp.step(x)));
            band += y * y;
        }
        const dt = n / this.sr;
        const db = 10 * Math.log10(full / n + 1e-12);
        const side = 10 * Math.log10(band / n + 1e-12);
        this.db = db;

        // Сглаженный уровень полосы речи (~20 мс) — для оценки шума.
        this.env += (side - this.env) * (1 - Math.exp(-dt / 0.02));
        // Шум = минимум сглаженного уровня за 6 окон по 0,25 с.
        if (this.warm) { this.mins.fill(this.env); this.subMin = this.env; this.warm = false; }
        if (this.env < this.subMin) this.subMin = this.env;
        this.subTime += dt;
        if (this.subTime >= 0.25) {
            this.mins.shift(); this.mins.push(this.subMin);
            this.subMin = this.env; this.subTime = 0;
        }
        let target = this.subMin;
        for (let i = 0; i < this.mins.length; i++) if (this.mins[i] < target) target = this.mins[i];
        // Минимум статистически ниже среднего шума — поправка +2 дБ; к цели плавно.
        target += 2;
        this.floor += (target - this.floor) * (1 - Math.exp(-dt / (target < this.floor ? 0.2 : 0.4)));
        if (this.floor < -85) this.floor = -85;
        if (this.floor > -25) this.floor = -25;

        let level, openAt, closeAt;
        if (this.auto) {
            level = side;
            openAt = Math.min(Math.max(this.floor + 12, -62), -20);
            closeAt = openAt - 5;
        } else {
            level = db;
            openAt = this.manual;
            closeAt = this.manual - 4;
        }
        this.threshold = openAt;

        if (level >= openAt) {
            this.above += dt;
            if (this.open || this.above >= 0.015) { this.open = true; this.hold = 0.35; }
        } else {
            this.above = 0;
            if (this.open) {
                if (level >= closeAt) this.hold = 0.35;
                else { this.hold -= dt; if (this.hold <= 0) this.open = false; }
            }
        }
    }
}
`;

const GATE_WORKLET_SOURCE = VOICE_DETECTOR_SOURCE + `
class ZvonVoiceGate extends AudioWorkletProcessor {
    constructor() {
        super();
        this.det = new VoiceDetector(sampleRate);
        this.gain = 0;
        this.attack = 1 - Math.exp(-1 / (0.003 * sampleRate));
        this.release = 1 - Math.exp(-1 / (0.08 * sampleRate));
        this.delay = new Float32Array(Math.max(1, Math.round(0.02 * sampleRate)));
        this.pos = 0;
        this.port.onmessage = (e) => { if (e.data && e.data.type === 'config') this.det.setConfig(e.data); };
    }
    process(inputs, outputs) {
        const input = inputs[0] && inputs[0][0];
        const out = outputs[0] && outputs[0][0];
        if (!out) return true;
        if (!input) { out.fill(0); return true; }
        this.det.analyze(input);
        const target = this.det.open ? 1 : 0;
        const d = this.delay, len = d.length;
        let g = this.gain, pos = this.pos;
        for (let i = 0; i < input.length; i++) {
            const delayed = d[pos];
            d[pos] = input[i];
            pos = pos + 1 === len ? 0 : pos + 1;
            g += (target - g) * (target > g ? this.attack : this.release);
            out[i] = delayed * g;
        }
        this.gain = g; this.pos = pos;
        return true;
    }
}
registerProcessor('zvon-voice-gate', ZvonVoiceGate);
`;

const gateModules = new WeakMap<BaseAudioContext, Promise<void>>();
const ensureGateWorklet = (ctx: BaseAudioContext): Promise<void> => {
    let p = gateModules.get(ctx);
    if (!p) {
        const url = URL.createObjectURL(new Blob([GATE_WORKLET_SOURCE], { type: 'application/javascript' }));
        p = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
        gateModules.set(ctx, p);
    }
    return p;
};

type AudioProcessor = TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>;

/**
 * Процессор LiveKit: [шумоподавление] → гейт. У трека LiveKit процессор один,
 * поэтому шумоподавление (DeepFilterNet или RNNoise) вложено внутрь: сначала
 * оно, потом гейт по уже очищенному сигналу.
 */
export class VoiceGateTrackProcessor implements AudioProcessor {
    name = 'zvon-voice-gate';
    processedTrack?: MediaStreamTrack;
    private cleanup?: () => void;

    constructor(private inner?: AudioProcessor) {}

    async init(opts: AudioProcessorOptions): Promise<void> {
        await this.build(opts);
    }

    async restart(opts: AudioProcessorOptions): Promise<void> {
        await this.teardown();
        await this.build(opts);
    }

    async destroy(): Promise<void> {
        await this.teardown();
    }

    private async build(opts: AudioProcessorOptions): Promise<void> {
        let source = opts.track;
        if (this.inner) {
            try {
                await this.inner.init(opts);
                if (this.inner.processedTrack) source = this.inner.processedTrack;
            } catch (e) {
                console.warn('[VoiceGate] шумоподавление не запустилось, гейт по сырому сигналу:', e);
            }
        }
        const ctx = opts.audioContext;
        try {
            await ensureGateWorklet(ctx);
            if (ctx.state === 'suspended') await ctx.resume().catch(() => { });
            const src = ctx.createMediaStreamSource(new MediaStream([source]));
            const node = new AudioWorkletNode(ctx, 'zvon-voice-gate', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                channelCount: 1,
                channelCountMode: 'explicit',
                outputChannelCount: [1],
            });
            const unregister = registerVoiceGateNode(node);
            const dest = ctx.createMediaStreamDestination();
            src.connect(node);
            node.connect(dest);
            this.processedTrack = dest.stream.getAudioTracks()[0];
            this.cleanup = () => {
                unregister();
                try { src.disconnect(); } catch { /* */ }
                try { node.disconnect(); } catch { /* */ }
                try { dest.disconnect(); } catch { /* */ }
            };
        } catch (e) {
            // Без гейта лучше, чем без звука.
            console.warn('[VoiceGate] гейт не запустился, микрофон без голосовой активации:', e);
            this.processedTrack = source;
        }
    }

    private async teardown(): Promise<void> {
        try { this.cleanup?.(); } catch { /* */ }
        this.cleanup = undefined;
        if (this.inner) {
            try { await this.inner.destroy(); } catch { /* */ }
        }
        this.processedTrack = undefined;
    }
}
