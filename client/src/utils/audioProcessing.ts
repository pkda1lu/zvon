import { RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';

export const setupNoiseSuppression = async (
    context: AudioContext,
    sourceStream: MediaStream
): Promise<MediaStream> => {
    try {
        console.log('Setting up noise suppression...');

        // Load the AudioWorklet
        await context.audioWorklet.addModule(rnnoiseWorkletPath);

        // Calculate frame size latency (RNNoise uses specific frame sizes)
        // Ensure we handle the stream correctly
        const sourceNode = context.createMediaStreamSource(sourceStream);
        const destinationNode = context.createMediaStreamDestination();

        const rnnoiseNode = new RnnoiseWorkletNode(context, {
            // @ts-ignore
            wasmUrl: rnnoiseWasmPath
        });

        sourceNode.connect(rnnoiseNode);
        rnnoiseNode.connect(destinationNode);

        console.log('Noise suppression setup complete.');
        return destinationNode.stream;
    } catch (error) {
        console.error('Failed to setup noise suppression:', error);
        return sourceStream; // Fallback to original stream
    }
};
