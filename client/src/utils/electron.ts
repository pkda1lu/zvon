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

    if (!win.electron) {
        console.log('Electron API not found immediately. Checking...');
        console.log('Window properties:', {
            hasElectron: !!win.electron,
            hasProcess: !!win.process,
            userAgent: win.navigator?.userAgent,
            allKeys: Object.keys(win).filter(k => k.includes('electron') || k.includes('Electron'))
        });
        return null;
    }

    const electronAPI = win.electron;
    console.log('Electron API found:', Object.keys(electronAPI));

    // Validate that the API has the expected structure
    if (!electronAPI.desktopCapturer && !electronAPI.ipc) {
        console.warn('Electron API found but missing both desktopCapturer and ipc');
        console.warn('Available keys:', Object.keys(electronAPI));
    }

    return electronAPI;
};

// Get available screen sources
export const getScreenSources = async (): Promise<any[]> => {
    const electronAPI = getElectronAPI();

    if (!electronAPI) {
        return [];
    }

    try {
        const desktopCapturer = electronAPI.desktopCapturer;
        if (desktopCapturer && typeof desktopCapturer.getSources === 'function') {
            return await desktopCapturer.getSources({
                types: ['window', 'screen'],
                thumbnailSize: { width: 200, height: 150 }
            });
        }

        if (electronAPI.ipc && typeof electronAPI.ipc.invoke === 'function') {
            return await electronAPI.ipc.invoke('get-desktop-sources', {
                types: ['window', 'screen'],
                thumbnailSize: { width: 200, height: 150 }
            });
        }
    } catch (error) {
        console.error('Error getting screen sources:', error);
    }

    return [];
};

// Request screen sources using Electron desktopCapturer
export const getElectronDisplayMedia = async (sourceId?: string): Promise<MediaStream | null> => {
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
        // Try direct desktopCapturer first - with extra safety checks
        const desktopCapturer = electronAPI.desktopCapturer;
        if (desktopCapturer && typeof desktopCapturer.getSources === 'function') {
            console.log('Using Electron desktopCapturer API (direct)');
            try {
                sources = await desktopCapturer.getSources({
                    types: ['window', 'screen']
                });
            } catch (directError) {
                console.error('Direct desktopCapturer.getSources failed:', directError);
                // Fall through to IPC fallback
                throw directError;
            }
        }

        // If direct method didn't work or wasn't available, try IPC
        if (!sources && electronAPI.ipc && typeof electronAPI.ipc.invoke === 'function') {
            console.log('Using IPC for desktopCapturer');
            try {
                sources = await electronAPI.ipc.invoke('get-desktop-sources', {
                    types: ['window', 'screen']
                });
            } catch (ipcError) {
                console.error('IPC get-desktop-sources failed:', ipcError);
                throw ipcError;
            }
        }

        // If still no sources, log diagnostic info
        if (!sources) {
            console.error('desktopCapturer not available in Electron API');
            console.error('Available keys:', Object.keys(electronAPI));
            console.error('desktopCapturer type:', typeof electronAPI.desktopCapturer);
            console.error('desktopCapturer value:', electronAPI.desktopCapturer);
            console.error('ipc type:', typeof electronAPI.ipc);
            console.error('ipc value:', electronAPI.ipc);
            return null;
        }
    } catch (error) {
        console.error('Error getting sources:', error);
        // Try IPC as last resort if we haven't tried it yet
        if (electronAPI.ipc && typeof electronAPI.ipc.invoke === 'function') {
            try {
                console.log('Attempting IPC fallback after error');
                sources = await electronAPI.ipc.invoke('get-desktop-sources', {
                    types: ['window', 'screen']
                });
            } catch (fallbackError) {
                console.error('IPC fallback also failed:', fallbackError);
                return null;
            }
        } else {
            return null;
        }
    }

    try {
        return await createStreamFromSources(sources, sourceId);
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
async function createStreamFromSources(sources: any[], sourceId?: string): Promise<MediaStream | null> {
    console.log('Available sources:', sources.length);
    if (sources.length === 0) {
        console.error('No sources available');
        return null;
    }

    let selectedSource: any;

    if (sourceId) {
        // Use the specified source
        selectedSource = sources.find((s: any) => s.id === sourceId);
        if (!selectedSource) {
            console.warn('Specified source not found, using first available');
            selectedSource = sources[0];
        }
    } else {
        // Find screen sources (prefer full screen over windows)
        selectedSource = sources.find((s: any) => s.id.startsWith('screen:'));
        if (!selectedSource) {
            console.log('No screen source found. Available sources:', sources.map((s: any) => ({ id: s.id, name: s.name })));
            // Try to use first available source as fallback
            selectedSource = sources[0];
        }
    }

    if (!selectedSource) {
        return null;
    }

    console.log('Using source:', selectedSource.id, selectedSource.name);
    return await createStreamFromSource(selectedSource);
}

// Helper function to create stream from a single source
async function createStreamFromSource(source: any): Promise<MediaStream> {
    // Determine if this is a screen source or a window source
    const isScreen = source.id.startsWith('screen:');

    // For Electron, we need to use the correct constraints format
    // On Windows, system audio capture works for screen and many window sources
    const constraints: any = {
        audio: {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id
            }
        },
        video: {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id,
                maxWidth: 1920,
                maxHeight: 1080,
                maxFrameRate: 60
            }
        }
    };

    console.log('Requesting stream with constraints:', JSON.stringify(constraints, null, 2));

    let stream: MediaStream;
    try {
        // Try with getUserMedia
        stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error: any) {
        console.error('getUserMedia failed, trying video only:', error);
        try {
            const videoOnlyConstraints: any = {
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: source.id
                    }
                }
            };
            stream = await navigator.mediaDevices.getUserMedia(videoOnlyConstraints);
        } catch (fallbackError: any) {
            console.error('Fallback getUserMedia also failed:', fallbackError);
            throw fallbackError;
        }
    }

    console.log('Successfully got Electron display media stream');
    console.log('Audio tracks:', stream.getAudioTracks().length);
    console.log('Video tracks:', stream.getVideoTracks().length);

    // Verify video track is working
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
        console.log('Video track settings:', videoTrack.getSettings());
        console.log('Video track constraints:', videoTrack.getConstraints());
        // Ensure track is enabled
        videoTrack.enabled = true;

        // Monitor track state
        videoTrack.onended = () => {
            console.log('Video track ended');
        };
        videoTrack.onmute = () => {
            console.log('Video track muted');
        };
        videoTrack.onunmute = () => {
            console.log('Video track unmuted');
        };
    } else {
        console.error('No video track in stream!');
    }

    // Log audio track info
    stream.getAudioTracks().forEach((track, index) => {
        console.log(`Audio track ${index}:`, {
            id: track.id,
            label: track.label,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
            settings: track.getSettings()
        });
    });

    // Log video track info
    stream.getVideoTracks().forEach((track, index) => {
        console.log(`Video track ${index}:`, {
            id: track.id,
            label: track.label,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
            settings: track.getSettings()
        });
    });

    return stream;
}

