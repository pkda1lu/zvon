import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useVoice } from './VoiceContext';
import { useAuth } from './AuthContext';
import axios from 'axios';

export interface Keybind {
    id: string;
    action: string;
    accelerator: string;
    isEnabled: boolean;
}

interface KeybindsContextType {
    keybinds: Keybind[];
    addKeybind: (action: string, accelerator: string) => void;
    removeKeybind: (id: string) => void;
    updateKeybind: (id: string, updates: Partial<Keybind>) => void;
    resetKeybinds: () => void;
    isRecording: boolean;
    startRecording: (id: string) => void;
    stopRecording: () => void;
    recordingId: string | null;
}

const KeybindsContext = createContext<KeybindsContextType | undefined>(undefined);

const DEFAULT_KEYBINDS: Keybind[] = [
    { id: '1', action: 'toggle-mute', accelerator: 'CommandOrControl+Shift+M', isEnabled: true },
    { id: '2', action: 'toggle-deafen', accelerator: 'CommandOrControl+Shift+D', isEnabled: true },
    { id: '3', action: 'toggle-overlay', accelerator: 'CommandOrControl+Shift+O', isEnabled: true },
    { id: '4', action: 'server-next', accelerator: 'Alt+Down', isEnabled: true },
    { id: '5', action: 'server-prev', accelerator: 'Alt+Up', isEnabled: true },
    { id: '6', action: 'channel-next', accelerator: 'Alt+Right', isEnabled: true },
    { id: '7', action: 'channel-prev', accelerator: 'Alt+Left', isEnabled: true },
    { id: '8', action: 'mark-server-read', accelerator: 'Shift+Escape', isEnabled: true },
    { id: '9', action: 'mark-chat-read', accelerator: 'Alt+Escape', isEnabled: true },
    { id: '10', action: 'open-notifications', accelerator: 'CommandOrControl+I', isEnabled: true },
    { id: '11', action: 'scroll-up', accelerator: 'PageUp', isEnabled: true },
    { id: '12', action: 'scroll-down', accelerator: 'PageDown', isEnabled: true },
    { id: '13', action: 'edit-last', accelerator: 'Up', isEnabled: true },
    { id: '14', action: 'delete-last', accelerator: 'CommandOrControl+Backspace', isEnabled: true },
    { id: '15', action: 'close-window', accelerator: 'Escape', isEnabled: true },
    { id: '16', action: 'minimize-to-tray', accelerator: 'CommandOrControl+M', isEnabled: true }
];

export const KeybindsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { toggleMute, toggleDeafen, toggleOverlay } = useVoice();
    const { user, updateUser } = useAuth();
    const normalizeKeybinds = (list: Keybind[]): Keybind[] => {
        return list.map(kb => {
            if (kb.action === 'close-window' && kb.accelerator === 'CommandOrControl+W') {
                return { ...kb, accelerator: 'Escape' };
            }
            if (kb.action === 'mark-chat-read' && kb.accelerator === 'Escape' && list.some(k => k.action === 'close-window' && k.accelerator === 'Escape')) {
                return { ...kb, accelerator: 'Alt+Escape' };
            }
            return kb;
        });
    };

    const [keybinds, setKeybinds] = useState<Keybind[]>(() => {
        const savedKeybinds = user?.settings?.interaction?.keybinds;
        if (savedKeybinds && savedKeybinds.length > 0) return normalizeKeybinds(savedKeybinds);
        const saved = localStorage.getItem('keybinds');
        if (saved) return normalizeKeybinds(JSON.parse(saved));
        return DEFAULT_KEYBINDS;
    });

    const isInitialMount = useRef(true);
    // Сериализованный снимок кейбиндов, который уже синхронизирован с сервером.
    // Защищает от петли: сохранили → updateUser → новая ссылка user.keybinds →
    // setKeybinds → снова сохранение. Если значение не изменилось — не дёргаем сеть.
    const lastSyncedRef = useRef<string>(JSON.stringify(keybinds));

    // Load from user object when it changes (e.g. after login)
    useEffect(() => {
        const savedKeybinds = user?.settings?.interaction?.keybinds;
        if (savedKeybinds && savedKeybinds.length > 0) {
            const normalized = normalizeKeybinds(savedKeybinds);
            const serialized = JSON.stringify(normalized);
            if (serialized !== lastSyncedRef.current) {
                lastSyncedRef.current = serialized;
                setKeybinds(normalized);
            }
        }
    }, [user?.settings?.interaction?.keybinds]);

    const saveKeybinds = useCallback(async (newKeybinds: Keybind[]) => {
        localStorage.setItem('keybinds', JSON.stringify(newKeybinds));

        // Sync with Electron
        // @ts-ignore
        if (window.electron && window.electron.ipc) {
            // @ts-ignore
            window.electron.ipc.send('update-keybinds', newKeybinds.filter(k => k.isEnabled));
        }

        if (user) {
            try {
                const { data } = await axios.put('/api/users/settings', {
                    settings: { interaction: { keybinds: newKeybinds } }
                });
                const savedKb = data?.settings?.interaction?.keybinds;
                lastSyncedRef.current = JSON.stringify(savedKb ?? newKeybinds);
                updateUser({ settings: data.settings });
            } catch (err) {
                console.error('Failed to save keybinds to server:', err);
            }
        }
    }, [user, updateUser]);

    // Держим актуальную ссылку на saveKeybinds в ref, чтобы её пересоздание
    // (при смене user/updateUser) не перезапускало эффект-дебаунсер ниже.
    const saveKeybindsRef = useRef(saveKeybinds);
    useEffect(() => { saveKeybindsRef.current = saveKeybinds; }, [saveKeybinds]);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        // Это значение уже синхронизировано (пришло с сервера/при гидратации) — не сохраняем.
        if (JSON.stringify(keybinds) === lastSyncedRef.current) return;
        const timer = setTimeout(() => {
            lastSyncedRef.current = JSON.stringify(keybinds);
            saveKeybindsRef.current(keybinds);
        }, 1000); // Debounce saves
        return () => clearTimeout(timer);
    }, [keybinds]);

    const [isRecording, setIsRecording] = useState(false);
    const [recordingId, setRecordingId] = useState<string | null>(null);

    const handleWebKeybind = useCallback((e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        const isArrowUpInInput = target.tagName === 'INPUT' && e.key === 'ArrowUp' && (target as HTMLInputElement).value === '';
        
        if (isInput && !isArrowUpInInput && e.key !== 'Escape') return;

        const modifiers = [];
        if (e.ctrlKey || e.metaKey) modifiers.push('CommandOrControl');
        if (e.shiftKey) modifiers.push('Shift');
        if (e.altKey) modifiers.push('Alt');

        let key = e.key.toUpperCase();
        if (key === ' ') key = 'SPACE';
        if (key === 'ESCAPE') key = 'ESCAPE';
        if (key === 'BACKSPACE') key = 'BACKSPACE';
        if (key === 'PAGEUP') key = 'PAGEUP';
        if (key === 'PAGEDOWN') key = 'PAGEDOWN';
        if (key === 'ARROWUP') key = 'UP';
        if (key === 'ARROWDOWN') key = 'DOWN';
        if (key === 'ARROWLEFT') key = 'LEFT';
        if (key === 'ARROWRIGHT') key = 'RIGHT';

        const currentAccelerator = [...modifiers, key].join('+');
        const matches = keybinds.filter(k => k.isEnabled && k.accelerator.toUpperCase() === currentAccelerator);
        
        if (matches.length > 0) {
            e.preventDefault();
            const actionsTriggered = new Set<string>();
            matches.forEach(match => {
                if (!actionsTriggered.has(match.action)) {
                    actionsTriggered.add(match.action);
                    window.dispatchEvent(new CustomEvent('zvon-keybind-action', { detail: { action: match.action } }));
                    if (match.action === 'toggle-mute') toggleMute();
                    if (match.action === 'toggle-deafen') toggleDeafen();
                    if (match.action === 'toggle-overlay') toggleOverlay();
                }
            });
        }
    }, [keybinds, toggleMute, toggleDeafen, toggleOverlay]);

    useEffect(() => {
        window.addEventListener('keydown', handleWebKeybind);
        return () => window.removeEventListener('keydown', handleWebKeybind);
    }, [handleWebKeybind]);

    useEffect(() => {
        // @ts-ignore
        if (window.electron && window.electron.ipc) {
            // @ts-ignore
            const unMute = window.electron.ipc.on('toggle-mute-shortcut', () => toggleMute());
            // @ts-ignore
            const unDeafen = window.electron.ipc.on('toggle-deafen-shortcut', () => toggleDeafen());
            // @ts-ignore
            const unOverlay = window.electron.ipc.on('toggle-overlay-shortcut', () => toggleOverlay());
            // @ts-ignore
            const unAction = window.electron.ipc.on('keybind-action', (_event: any, action: string) => {
                window.dispatchEvent(new CustomEvent('zvon-keybind-action', { detail: { action } }));
                if (action === 'toggle-mute') toggleMute();
                if (action === 'toggle-deafen') toggleDeafen();
                if (action === 'toggle-overlay') toggleOverlay();
            });

            return () => {
                unMute(); unDeafen(); unOverlay(); unAction();
            };
        }
    }, [toggleMute, toggleDeafen, toggleOverlay]);

    const addKeybind = (action: string, accelerator: string) => {
        const newKeybind: Keybind = {
            id: Math.random().toString(36).substr(2, 9),
            action,
            accelerator,
            isEnabled: true
        };
        setKeybinds(prev => [...prev, newKeybind]);
    };

    const removeKeybind = (id: string) => {
        setKeybinds(prev => prev.filter(k => k.id !== id));
    };

    const updateKeybind = (id: string, updates: Partial<Keybind>) => {
        setKeybinds(prev => prev.map(k => k.id === id ? { ...k, ...updates } : k));
    };

    const startRecording = (id: string) => {
        setIsRecording(true);
        setRecordingId(id);
    };

    const stopRecording = () => {
        setIsRecording(false);
        setRecordingId(null);
    };

    const resetKeybinds = () => {
        setKeybinds(DEFAULT_KEYBINDS);
    };

    return (
        <KeybindsContext.Provider value={{
            keybinds, addKeybind, removeKeybind, updateKeybind, resetKeybinds,
            isRecording, startRecording, stopRecording, recordingId
        }}>
            {children}
        </KeybindsContext.Provider>
    );
};

export const useKeybinds = () => {
    const context = useContext(KeybindsContext);
    if (!context) throw new Error('useKeybinds must be used within KeybindsProvider');
    return context;
};


