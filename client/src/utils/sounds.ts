export const SOUNDS = {
    MESSAGE_NOTIFY: 'sounds/message_notify.mp3',
    VOICE_JOIN: 'sounds/voice_join.mp3',
    VOICE_LEAVE: 'sounds/voice_leave.mp3',
    CALL_INCOMING: 'sounds/call_incoming.mp3',
    SCREENSHARE_TOGGLE: 'sounds/screenshare_toggle.mp3',
};

class SoundManager {
    private audioCache: Map<string, HTMLAudioElement> = new Map();

    play(soundPath: string, volume: number = 0.5) {
        try {
            // Determine the base URL dynamically if possible, or assume relative to public root
            // In Vite/Electron, referencing /sounds/... usually works if it's in public

            let audio = new Audio(soundPath);
            audio.volume = volume;

            // Clean up old audio objects if we cached them (optional, basic simple play for now)
            // For overlapping sounds (spamming messages), new Audio() is actually better than reusing.

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
        audio.play().catch(e => console.warn('Loop playback failed:', e));
        return audio;
    }
}

export const soundManager = new SoundManager();
