import React, { useEffect } from 'react';
import { useAppearance } from '../contexts/AppearanceContext';

const ScreenReaderHandler: React.FC = () => {
    const { screenReader } = useAppearance();

    useEffect(() => {
        if (!screenReader) return;

        const handleFocus = (e: FocusEvent) => {
            const target = e.target as HTMLElement;
            if (!target) return;

            // Priority: aria-label, then innerText (if short), then title, then alt (for images)
            let text = target.getAttribute('aria-label');
            
            if (!text && target.innerText && target.innerText.length < 100) {
                text = target.innerText;
            }

            if (!text) {
                text = target.getAttribute('title');
            }

            if (!text && target.tagName === 'IMG') {
                text = target.getAttribute('alt');
            }

            if (text) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'ru-RU'; // Default to Russian as per project language
                
                // Try to match utterance language with app language if possible
                // (Though SpeechSynthesisUtterance language detection is tricky)

                window.speechSynthesis.cancel(); // Stop current speech
                window.speechSynthesis.speak(utterance);
            }
        };

        // Also handle hover if needed? User usually expects screen readers to work on focus.
        // For a more "interactive" feel, we could add a slight delay for hover.

        document.addEventListener('focusin', handleFocus);
        return () => {
            document.removeEventListener('focusin', handleFocus);
            window.speechSynthesis.cancel();
        };
    }, [screenReader]);

    return null;
};

export default ScreenReaderHandler;
