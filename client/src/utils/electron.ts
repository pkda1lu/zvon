// Utility to detect if running in Electron
export const isElectron = (): boolean => {
    // Check multiple ways to detect Electron
    const win = window as any;
    return !!(
        win.process?.type === 'renderer' || 
        win.electron?.isElectron === true ||
        win.navigator?.userAgent?.includes('Electron') ||
        (typeof process !== 'undefined' && process.versions?.electron)
    );
};

// Get Electron API if available
export const getElectronAPI = () => {
    const win = window as any;
    if (win.electron) {
        console.log('Electron API found:', Object.keys(win.electron));
        return win.electron;
    }
    console.log('Electron API not found. Available:', {
        hasElectron: !!win.electron,
        hasProcess: !!win.process,
        userAgent: win.navigator?.userAgent
    });
    return null;
};

// Request screen sources using Electron desktopCapturer
export const getElectronDisplayMedia = async (): Promise<MediaStream | null> => {
    const electronAPI = getElectronAPI();
    
    if (!electronAPI) {
        console.log('Electron API not available - window.electron is undefined');
        // Try IPC fallback
        if ((window as any).electron?.ipc) {
            console.log('Trying IPC fallback for desktopCapturer');
            try {
                const sources = await (window as any).electron.ipc.invoke('get-desktop-sources', {
                    types: ['window', 'screen']
                });
                return await createStreamFromSources(sources);
            } catch (error) {
                console.error('IPC fallback failed:', error);
            }
        }
        return null;
    }

    let sources;
    try {
        // Try direct desktopCapturer first
        if (electronAPI.desktopCapturer && electronAPI.desktopCapturer.getSources) {
            console.log('Using Electron desktopCapturer API (direct)');
            sources = await electronAPI.desktopCapturer.getSources({
                types: ['window', 'screen']
            });
        } else if (electronAPI.ipc) {
            // Fallback to IPC
            console.log('Using IPC for desktopCapturer');
            sources = await electronAPI.ipc.invoke('get-desktop-sources', {
                types: ['window', 'screen']
            });
        } else {
            console.error('desktopCapturer not available in Electron API. Available keys:', Object.keys(electronAPI));
            return null;
        }
    } catch (error) {
        console.error('Error getting sources:', error);
        return null;
    }

    try {

        return await createStreamFromSources(sources);
    } catch (error: any) {
        console.error('Error getting Electron display media:', error);
        console.error('Error details:', {
            message: error?.message,
            name: error?.name,
            stack: error?.stack
        });
        return null;
    }
};

// Helper function to create stream from sources
async function createStreamFromSources(sources: any[]): Promise<MediaStream | null> {
    console.log('Available sources:', sources.length);
    if (sources.length === 0) {
        console.error('No sources available');
        return null;
    }

    // Find screen sources (prefer full screen over windows)
    const screenSource = sources.find((s: any) => s.id.startsWith('screen:'));
    if (!screenSource) {
        console.error('No screen source found. Available sources:', sources.map((s: any) => ({ id: s.id, name: s.name })));
        // Try to use first available source as fallback
        const firstSource = sources[0];
        if (firstSource) {
            console.log('Using first available source as fallback:', firstSource.id, firstSource.name);
            return await createStreamFromSource(firstSource);
        }
        return null;
    }

    console.log('Using screen source:', screenSource.id, screenSource.name);
    return await createStreamFromSource(screenSource);
}

// Helper function to create stream from a single source
async function createStreamFromSource(source: any): Promise<MediaStream> {
    // Use navigator.mediaDevices.getUserMedia with electron's sourceId
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id
            }
        } as any,
        video: {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id
            }
        } as any
    });

    console.log('Successfully got Electron display media stream');
    return stream;
}

