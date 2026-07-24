import React, { Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { VoiceProvider } from './contexts/VoiceContext';
import { InboxProvider } from './contexts/InboxContext';
import { KeybindsProvider } from './contexts/KeybindsContext';

// Тяжёлые ветки грузятся лениво: Main — весь чат-апп (рендерится только для
// авторизованных), Landing — маркетинговая страница (только для гостей в вебе).
// Так неавторизованный веб-посетитель и страницы логина/докс не тянут бандл Main.
const Main = React.lazy(() => import('./pages/Main'));
const Landing = React.lazy(() => import('./pages/Landing'));

const HomeLoader: React.FC = () => (
    <div className="invite-page-loading">
        <div className="loading-spinner-rings">
            <div></div><div></div><div></div><div></div>
        </div>
        <span>Инициализация...</span>
    </div>
);

const Home: React.FC = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return <HomeLoader />;
    }

    if (!user) {
        const isElectron = !!(window as any).electron;
        return isElectron ? <Navigate to="/login" replace /> : (
            <Suspense fallback={<HomeLoader />}>
                <Landing />
            </Suspense>
        );
    }

    return (
        <Suspense fallback={<HomeLoader />}>
            <SocketProvider>
                <VoiceProvider>
                    <KeybindsProvider>
                        <InboxProvider>
                            <Main />
                        </InboxProvider>
                    </KeybindsProvider>
                </VoiceProvider>
            </SocketProvider>
        </Suspense>
    );
};

export default Home;
