import React from 'react';
import { SocketProvider } from './contexts/SocketContext';
import { VoiceProvider } from './contexts/VoiceContext';
import { CallSettingsProvider } from './contexts/CallSettingsContext';
import { InboxProvider } from './contexts/InboxContext';
import { KeybindsProvider } from './contexts/KeybindsContext';
import Main from './pages/Main';

// Стек провайдеров авторизованной части вынесен из Home в отдельный модуль,
// чтобы он целиком уезжал в ленивый чанк. Раньше Home импортировался из App
// статически и тянул VoiceContext в entry — а вместе с ним livekit-client
// (~420 КБ), который грузился даже у гостя на лендинге и на странице логина.
// Здесь Main импортируется обычным import: он и так внутри ленивого чанка,
// отдельная граница Suspense ему уже не нужна.
const AuthedApp: React.FC = () => (
    <SocketProvider>
        <CallSettingsProvider>
            <VoiceProvider>
                <KeybindsProvider>
                    <InboxProvider>
                        <Main />
                    </InboxProvider>
                </KeybindsProvider>
            </VoiceProvider>
        </CallSettingsProvider>
    </SocketProvider>
);

export default AuthedApp;
