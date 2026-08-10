import React, { createContext, useContext, useState, useEffect } from 'react';

export type ChatDisplayMode = 'cozy' | 'compact' | 'light';
export type SendHotkeyMode = 'enter' | 'shiftEnter';

interface ChatSettings {
    displayMode: ChatDisplayMode;
    sendHotkey: SendHotkeyMode;
    showPreview: boolean;
    autoPlayGif: boolean;
    highlightMentions: boolean;
    emojiAutocomplete: boolean;
    showHoverBar: boolean;
    textToSpeech: boolean;
    showStickers: boolean;
}

interface ChatSettingsContextType extends ChatSettings {
    setDisplayMode: (value: ChatDisplayMode) => void;
    setSendHotkey: (value: SendHotkeyMode) => void;
    setShowPreview: (value: boolean) => void;
    setAutoPlayGif: (value: boolean) => void;
    setHighlightMentions: (value: boolean) => void;
    setEmojiAutocomplete: (value: boolean) => void;
    setShowHoverBar: (value: boolean) => void;
    setTextToSpeech: (value: boolean) => void;
    setShowStickers: (value: boolean) => void;
}

const ChatSettingsContext = createContext<ChatSettingsContextType | undefined>(undefined);

export const ChatSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<ChatSettings>(() => {
        const saved = localStorage.getItem('chat-settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                displayMode: parsed.displayMode || parsed.density || 'cozy',
                sendHotkey: parsed.sendHotkey || 'enter',
                showPreview: parsed.showPreview ?? parsed.displayEmbeds ?? true,
                autoPlayGif: parsed.autoPlayGif ?? parsed.autoPlayGifs ?? true,
                highlightMentions: parsed.highlightMentions ?? parsed.mentionHighlight ?? true,
                emojiAutocomplete: parsed.emojiAutocomplete ?? parsed.autocompleteEmoji ?? true,
                showHoverBar: parsed.showHoverBar ?? parsed.showHoverActions ?? true,
                textToSpeech: parsed.textToSpeech ?? parsed.enableTTS ?? false,
                showStickers: parsed.showStickers ?? true,
            };
        }
        return {
            displayMode: 'cozy',
            sendHotkey: 'enter',
            showPreview: true,
            autoPlayGif: true,
            highlightMentions: true,
            emojiAutocomplete: true,
            showHoverBar: true,
            textToSpeech: false,
            showStickers: true,
        };
    });

    useEffect(() => {
        localStorage.setItem('chat-settings', JSON.stringify(settings));
        
        // Apply display mode to root if needed (though AppearanceContext handles its own)
        document.documentElement.dataset.chatLayout = settings.displayMode;
    }, [settings]);

    const setDisplayMode = (displayMode: ChatDisplayMode) => setSettings(prev => ({ ...prev, displayMode }));
    const setSendHotkey = (sendHotkey: SendHotkeyMode) => setSettings(prev => ({ ...prev, sendHotkey }));
    const setShowPreview = (showPreview: boolean) => setSettings(prev => ({ ...prev, showPreview }));
    const setAutoPlayGif = (autoPlayGif: boolean) => setSettings(prev => ({ ...prev, autoPlayGif }));
    const setHighlightMentions = (highlightMentions: boolean) => setSettings(prev => ({ ...prev, highlightMentions }));
    const setEmojiAutocomplete = (emojiAutocomplete: boolean) => setSettings(prev => ({ ...prev, emojiAutocomplete }));
    const setShowHoverBar = (showHoverBar: boolean) => setSettings(prev => ({ ...prev, showHoverBar }));
    const setTextToSpeech = (textToSpeech: boolean) => setSettings(prev => ({ ...prev, textToSpeech }));
    const setShowStickers = (showStickers: boolean) => setSettings(prev => ({ ...prev, showStickers }));

    return (
        <ChatSettingsContext.Provider value={{
            ...settings,
            setDisplayMode,
            setSendHotkey,
            setShowPreview,
            setAutoPlayGif,
            setHighlightMentions,
            setEmojiAutocomplete,
            setShowHoverBar,
            setTextToSpeech,
            setShowStickers
        }}>
            {children}
        </ChatSettingsContext.Provider>
    );
};

export const useChatSettings = () => {
    const context = useContext(ChatSettingsContext);
    if (context === undefined) {
        throw new Error('useChatSettings must be used within a ChatSettingsProvider');
    }
    return context;
};
