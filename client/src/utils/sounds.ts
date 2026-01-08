export const SOUNDS = {
    MESSAGE_NOTIFY: 'sounds/message_notify.mp3',
    VOICE_JOIN: 'sounds/voice_join.mp3',
    VOICE_LEAVE: 'sounds/voice_leave.mp3',
    CALL_INCOMING: 'sounds/call_incoming.mp3',
    SCREENSHARE_TOGGLE: 'sounds/screenshare_toggle.mp3',
};

class SoundManager {
    private audioContext: AudioContext | null = null;

    setAudioContext(ctx: AudioContext) {
        this.audioContext = ctx;
    }

    play(soundPath: string, volume: number = 0.5) {
        try {
            const audio = new Audio(soundPath);
            audio.volume = volume;

            if (this.audioContext) {
                try {
                    const source = this.audioContext.createMediaElementSource(audio);
                    source.connect(this.audioContext.destination);
                } catch (e) {
                    // source already connected might happen, just skip
                }
            }

            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn(`Sound playback failed for ${soundPath}:`, error);
                });
            }
        } catch (err) {
            console.error('Error playing sound:', err);
        }
    }

    playLoop(soundPath: string, volume: number = 0.5): HTMLAudioElement {
        const audio = new Audio(soundPath);
        audio.volume = volume;
        audio.loop = true;

        if (this.audioContext) {
            try {
                const source = this.audioContext.createMediaElementSource(audio);
                source.connect(this.audioContext.destination);
            } catch (e) { }
        }

        audio.play().catch(e => console.warn('Loop playback failed:', e));
        return audio;
    }
}

export const soundManager = new SoundManager();

