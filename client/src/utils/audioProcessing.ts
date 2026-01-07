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

        // Fetch the WASM file in the main thread where fetch/XHR works
        const response = await fetch(new URL(rnnoiseWasmPath, import.meta.url).href);
        const wasmBuffer = await response.arrayBuffer();

        const rnnoiseNode = new RnnoiseWorkletNode(context, {
            // @ts-ignore
            wasmBinary: wasmBuffer,
            maxChannels: 2
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
