/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __GIT_COMMIT_HASH__: string;
declare const __GIT_COMMIT_SHORT_HASH__: string;
declare const __GIT_COMMIT_AUTHOR__: string;
declare const __GIT_COMMIT_DATE__: string;
declare const __GIT_COMMIT_MESSAGE__: string;

interface Window {
    electron: {
        isElectron: boolean;
        ipc: {
            invoke: (channel: string, ...args: any[]) => Promise<any>;
            on: (channel: string, func: (...args: any[]) => void) => () => void;
            send: (channel: string, ...args: any[]) => void;
            removeAllListeners: (channel: string) => void;
        };
        clipboard: {
            writeText: (text: string) => void;
        };
        getCurrentActivity: () => Promise<any>;
        onActivityChanged: (callback: (activity: any) => void) => () => void;
        windowControls: {
            minimize: () => void;
            maximize: () => void;
            close: () => void;
        };
        getDesktopSources: (options: { types: string[]; thumbnailSize?: { width: number; height: number } }) => Promise<any[]>;
        setContentProtection: (enabled: boolean) => Promise<void>;
    };
}
