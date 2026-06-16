import React, { createContext, useContext, useState, useEffect } from 'react';

export type TimeFormat = '12h' | '24h';
export type Language = 'ru' | 'en'; // Keeping en for future, but user asked for ru

interface LanguageSettings {
    language: Language;
    timeFormat: TimeFormat;
}

interface LanguageContextType extends LanguageSettings {
    setLanguage: (lang: Language) => void;
    setTimeFormat: (format: TimeFormat) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<LanguageSettings>(() => {
        const saved = localStorage.getItem('language-settings');
        if (saved) {
            return JSON.parse(saved);
        }
        return {
            language: 'ru',
            timeFormat: '24h',
        };
    });

    useEffect(() => {
        localStorage.setItem('language-settings', JSON.stringify(settings));
        document.documentElement.lang = settings.language;
    }, [settings]);

    const setLanguage = (language: Language) => setSettings(prev => ({ ...prev, language }));
    const setTimeFormat = (timeFormat: TimeFormat) => setSettings(prev => ({ ...prev, timeFormat }));

    return (
        <LanguageContext.Provider value={{
            ...settings,
            setLanguage,
            setTimeFormat
        }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
