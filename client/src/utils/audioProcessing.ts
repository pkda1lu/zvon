import {
    RnnoiseWorkletNode,
    NoiseGateWorkletNode,
    loadRnnoise,
} from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';
import { createDeepFilterProcessor } from './deepFilter';

// The rnnoise and noiseGate worklets share the same source basename
// ("workletProcessor.js"), which makes Vite's `?url` import collapse them into a
// single emitted asset. To dodge that collision we self-host the (tiny, stable)
// noise-gate worklet under public/worklets and load it by a fixed path.
const noiseGateWorkletPath = `${import.meta.env.BASE_URL || '/'}worklets/noisegate-worklet.js`
    .replace(/\/{2,}/g, '/');

// Cache the (SIMD-aware) wasm binary so we only download/compile it once per page.
let rnnoiseWasmPromise: Promise<ArrayBuffer> | null = null;
const getRnnoiseWasm = () => {
    if (!rnnoiseWasmPromise) {
        rnnoiseWasmPromise = loadRnnoise({
            url: rnnoiseWasmPath,
            simdUrl: rnnoiseSimdWasmPath,
        });
    }
    return rnnoiseWasmPromise;
};

// Track which AudioContexts already have our worklet modules registered so we
// don't pay the addModule round-trip on every mic (re)acquisition.
const registeredContexts = new WeakSet<AudioContext>();
const ensureWorklets = async (context: AudioContext) => {
    if (registeredContexts.has(context)) return;
    await Promise.all([
        context.audioWorklet.addModule(rnnoiseWorkletPath),
        context.audioWorklet.addModule(noiseGateWorkletPath),
    ]);
    registeredContexts.add(context);
};

export interface NoiseSuppressionOptions {
    /** Add a post-RNNoise noise gate/expander to kill residual hiss in pauses. */
    gate?: boolean;
    /** Gate open threshold in dB (signal above this opens the gate). */
    gateOpenThreshold?: number;
    /** Gate close threshold in dB (signal below this closes the gate). */
    gateCloseThreshold?: number;
    /** How long the gate stays open after the signal drops, in ms. */
    gateHoldMs?: number;
}

const DEFAULT_OPTIONS: Required<NoiseSuppressionOptions> = {
    gate: true,
    // RNNoise already removes most stationary noise; the gate is intentionally
    // gentle so it only trims the very quiet residual during silence and never
    // chops the front of speech.
    gateOpenThreshold: -50,
    gateCloseThreshold: -58,
    gateHoldMs: 200,
};

/**
 * Build an RNNoise (SIMD) → NoiseGate processing chain and return a MediaStream
 * carrying the cleaned audio. A `__nsCleanup` function is attached to the output
 * track so callers can tear the graph down when they replace the track.
 */
export const setupNoiseSuppression = async (
    context: AudioContext,
    sourceStream: MediaStream,
    options: NoiseSuppressionOptions = {}
): Promise<MediaStream> => {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    try {
        if (context.state === 'suspended') {
            try { await context.resume(); } catch { /* ignore */ }
        }

        const [wasmBinary] = await Promise.all([getRnnoiseWasm(), ensureWorklets(context)]);

        const sourceNode = context.createMediaStreamSource(sourceStream);
        const destinationNode = context.createMediaStreamDestination();

        const rnnoiseNode = new RnnoiseWorkletNode(context, {
            wasmBinary,
            maxChannels: 2,
        });

        let gateNode: NoiseGateWorkletNode | null = null;
        if (opts.gate) {
            gateNode = new NoiseGateWorkletNode(context, {
                openThreshold: opts.gateOpenThreshold,
                closeThreshold: opts.gateCloseThreshold,
                holdMs: opts.gateHoldMs,
                maxChannels: 2,
            });
        }

        // Wire: source -> rnnoise -> [gate] -> destination
        sourceNode.connect(rnnoiseNode);
        if (gateNode) {
            rnnoiseNode.connect(gateNode);
            gateNode.connect(destinationNode);
        } else {
            rnnoiseNode.connect(destinationNode);
        }

        const outStream = destinationNode.stream;
        const outTrack = outStream.getAudioTracks()[0];
        if (outTrack) {
            (outTrack as any).__nsCleanup = () => {
                try { sourceNode.disconnect(); } catch { /* */ }
                try { rnnoiseNode.disconnect(); } catch { /* */ }
                try { (rnnoiseNode as any).destroy?.(); } catch { /* */ }
                try { gateNode?.disconnect(); } catch { /* */ }
                try { destinationNode.disconnect(); } catch { /* */ }
            };
        }
        return outStream;
    } catch (error) {
        console.warn('[NS] RNNoise setup failed, passing through raw audio:', error);
        return sourceStream;
    }
};

/**
 * LiveKit TrackProcessor wrapper around the RNNoise (+ noise gate) chain so the
 * mode can be applied to a published mic track via `track.setProcessor(...)`,
 * the same way DeepFilterNet plugs in.
 */
export class RnnoiseTrackProcessor
    implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
    name = 'rnnoise-noise-suppression';
    processedTrack?: MediaStreamTrack;
    private cleanup?: () => void;

    constructor(private options: NoiseSuppressionOptions = {}) {}

    async init(opts: AudioProcessorOptions): Promise<void> {
        await this.build(opts);
    }

    async restart(opts: AudioProcessorOptions): Promise<void> {
        await this.destroy();
        await this.build(opts);
    }

    private async build(opts: AudioProcessorOptions): Promise<void> {
        const source = new MediaStream([opts.track]);
        const out = await setupNoiseSuppression(opts.audioContext, source, this.options);
        const track = out.getAudioTracks()[0];
        this.processedTrack = track;
        this.cleanup = (track as any)?.__nsCleanup;
    }

    async destroy(): Promise<void> {
        try { this.cleanup?.(); } catch { /* */ }
        this.cleanup = undefined;
        this.processedTrack = undefined;
    }
}

export type NoiseSuppressionMode = 'none' | 'standard' | 'rnnoise' | 'deepfilter';

/**
 * Returns the LiveKit audio processor for the chosen mode, or `undefined` when
 * no custom processing graph is needed:
 *   - 'deepfilter' → DeepFilterNet3 (AI)
 *   - 'rnnoise'    → RNNoise + noise gate (AI)
 *   - 'standard'   → browser-native suppression (handled by capture constraints)
 *   - 'none'       → no suppression
 */
export const createNoiseProcessor = (
    mode: NoiseSuppressionMode
): TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> | undefined => {
    if (mode === 'deepfilter') return createDeepFilterProcessor();
    if (mode === 'rnnoise') return new RnnoiseTrackProcessor();
    return undefined;
};
