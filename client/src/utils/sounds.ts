export const SOUNDS = {
    MESSAGE_NOTIFY: '/sounds/message.mp3',
    CALL_RINGING: '/sounds/ringing.mp3',
    CALL_JOIN: '/sounds/join.mp3',
    CALL_LEAVE: '/sounds/leave.mp3',
    MUTE: '/sounds/mute.mp3',
    UNMUTE: '/sounds/unmute.mp3'
};

export class SoundManager {
    private static instance: SoundManager;
    private audioContext: AudioContext | null = null;
    private soundBuffers: Map<string, AudioBuffer> = new Map();
    private isInitialized = false;

    private constructor() { }

    static getInstance(): SoundManager {
        if (!SoundManager.instance) SoundManager.instance = new SoundManager();
        return SoundManager.instance;
    }

    async init(existingContext?: AudioContext) {
        if (this.isInitialized) return;
        try {
            this.audioContext = existingContext || new ((window as any).AudioContext || (window as any).webkitAudioContext)();
            this.isInitialized = true;
        } catch (e) { }
    }

    async playSound(soundPath: string, volume: number = 0.5) {
        if (!this.isInitialized || !this.audioContext) return;
        try {
            let buffer = this.soundBuffers.get(soundPath);
            if (!buffer) {
                const resp = await fetch(soundPath);
                const arrayBuf = await resp.arrayBuffer();
                buffer = await this.audioContext.decodeAudioData(arrayBuf);
                this.soundBuffers.set(soundPath, buffer);
            }
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            source.buffer = buffer;
            gainNode.gain.value = volume;
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            source.start(0);
        } catch (err) { }
    }

    play(soundPath: string, volume: number = 0.5) {
        this.playSound(soundPath, volume);
    }

    playLoop(soundPath: string, volume: number = 0.5): HTMLAudioElement {
        const audio = new Audio(soundPath);
        audio.loop = true;
        audio.volume = volume;
        audio.play().catch(() => { });
        return audio;
    }
}

export const soundManager = SoundManager.getInstance();
