import { DeepFilterNoiseFilterProcessor } from 'deepfilternet3-noise-filter';

// DeepFilterNet3 fetches two assets at runtime:
//   {cdnUrl}/v2/pkg/df_bg.wasm
//   {cdnUrl}/v2/models/DeepFilterNet3_onnx.tar.gz
// We self-host them under public/df (served at <base>/df) instead of relying on
// the package's default third-party CDN.
const DF_CDN = `${import.meta.env.BASE_URL || '/'}df`.replace(/\/{2,}/g, '/').replace(/\/$/, '');

/**
 * Create a LiveKit audio TrackProcessor backed by DeepFilterNet3.
 * @param level Noise reduction strength, 0–100.
 */
export const createDeepFilterProcessor = (level = 90) =>
    new DeepFilterNoiseFilterProcessor({
        sampleRate: 48000,
        noiseReductionLevel: level,
        enabled: true,
        assetConfig: { cdnUrl: DF_CDN },
    });

export const isDeepFilterSupported = (): boolean => {
    try {
        return DeepFilterNoiseFilterProcessor.isSupported();
    } catch {
        return false;
    }
};
