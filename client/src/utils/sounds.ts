export const SOUNDS = {
    MESSAGE_NOTIFY: 'sounds/message_notify.mp3',
    CALL_RINGING: 'sounds/call_incoming.mp3',
    CALL_JOIN: 'sounds/voice_join.mp3',
    CALL_LEAVE: 'sounds/voice_leave.mp3',
    MUTE: 'sounds/mute.mp3',
    UNMUTE: 'sounds/unmute.mp3',
    VOICE_JOIN: 'sounds/voice_join.mp3',
    VOICE_LEAVE: 'sounds/voice_leave.mp3',
    SCREENSHARE_ON: 'sounds/screenshare_on.mp3',
    SCREENSHARE_TOGGLE: 'sounds/screenshare_toggle.mp3'
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

    setAudioContext(ctx: AudioContext) {
        this.audioContext = ctx;
        this.isInitialized = true;
    }

    async playSound(soundPath: string, volume: number = 0.5) {
        // Fallback to simple Audio element if Web Audio is not initialized
        if (!this.isInitialized || !this.audioContext) {
            try {
                const audio = new Audio(soundPath);
                audio.volume = volume;
                return await audio.play();
            } catch (err) {
                console.warn('[SoundManager] Fallback play failed:', err);
                return;
            }
        }

        try {
            let buffer = this.soundBuffers.get(soundPath);
            if (!buffer) {
                const resp = await fetch(soundPath);
                if (!resp.ok) throw new Error(`Failed to fetch sound: ${resp.status}`);
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
        } catch (err) {
            console.error('[SoundManager] Web Audio play failed, trying fallback:', err);
            try {
                const audio = new Audio(soundPath);
                audio.volume = volume;
                await audio.play();
            } catch (fallbackErr) { }
        }
    }

    play(soundPath: string, volume: number = 0.5) {
        this.playSound(soundPath, volume).catch(() => { });
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
