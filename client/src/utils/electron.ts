// Utility to detect if running in Electron
export const isElectron = (): boolean => {
    // Check multiple ways to detect Electron
    const win = window as any;
    return !!(
        win.process?.type === 'renderer' ||
        win.electron?.isElectron === true ||
        win.navigator?.userAgent?.includes('Electron') ||
        (typeof win.process !== 'undefined' && win.process.versions?.electron)
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

// Request screen sources using Electron display media mechanism
export const getElectronDisplayMedia = async (
    sourceId?: string,
    quality?: { resolution: string; frameRate: number }
): Promise<MediaStream | null> => {
    const electronAPI = getElectronAPI();

    if (!electronAPI || !electronAPI.ipc) {
        console.log('Electron API not available, falling back to standard getDisplayMedia');
        try {
            return await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
        } catch (err) {
            console.error('Standard getDisplayMedia failed:', err);
            return null;
        }
    }

    try {
        if (sourceId && electronAPI.setPendingDisplaySource) {
            console.log('Setting pending source ID for display media:', sourceId);
            electronAPI.setPendingDisplaySource(sourceId);
        }

        // Use getDisplayMedia which is better for sound capture on Windows
        // The setDisplayMediaRequestHandler in Main process will pick up the sourceId
        const constraints: any = {
            video: true,
            audio: {
                selfBrowserSurface: "exclude",
                systemAudio: "include"
            }
        };

        if (quality) {
            const res = getResolutionDimensions(quality.resolution);
            constraints.video = {
                frameRate: { ideal: quality.frameRate, max: quality.frameRate },
                ...(res ? { width: { ideal: res.width }, height: { ideal: res.height } } : {})
            };
        }

        const stream = await navigator.mediaDevices.getDisplayMedia(constraints);

        return stream;
    } catch (error) {
        console.error('Error getting Electron display media via getDisplayMedia:', error);

        // Final fallback to the old way if getDisplayMedia fails
        try {
            const sources = await electronAPI.ipc.invoke('get-desktop-sources', {
                types: ['window', 'screen']
            });
            return await createStreamFromSources(sources, sourceId, quality);
        } catch (fallbackError) {
            console.error('All display media methods failed:', fallbackError);
            return null;
        }
    }
};

// Helper function to create stream from sources
async function createStreamFromSources(
    sources: any[],
    sourceId?: string,
    quality?: { resolution: string; frameRate: number }
): Promise<MediaStream | null> {
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
    return await createStreamFromSource(selectedSource, quality);
}

// Helper function to create stream from a single source
async function createStreamFromSource(
    source: any,
    quality?: { resolution: string; frameRate: number }
): Promise<MediaStream> {
    // Determine if this is a screen source or a window source
    const isScreen = source.id.startsWith('screen:');

    // For Electron, we need to use the correct constraints format
    // On Windows, system audio capture works for screen and many window sources
    const res = quality ? getResolutionDimensions(quality.resolution) : { width: 1920, height: 1080 };
    const fps = quality ? quality.frameRate : 60;

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
                maxWidth: res ? res.width : 1920,
                maxHeight: res ? res.height : 1080,
                maxFrameRate: fps
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

function getResolutionDimensions(resolution: string): { width: number; height: number } | null {
    switch (resolution) {
        case '480p': return { width: 854, height: 480 };
        case '720p': return { width: 1280, height: 720 };
        case '1080p': return { width: 1920, height: 1080 };
        case '1440p': return { width: 2560, height: 1440 };
        case '4k': return { width: 3840, height: 2160 };
        default: return null;
    }
}

