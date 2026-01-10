import React from 'react';
import { useAuth } from './contexts/AuthContext';
import Landing from './pages/Landing';
import { SocketProvider } from './contexts/SocketContext';
import { VoiceProvider } from './contexts/VoiceContext';
import Main from './pages/Main';

const Home: React.FC = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="invite-page-loading">
                <div className="loading-spinner-rings">
                    <div></div><div></div><div></div><div></div>
                </div>
                <span>Инициализация...</span>
            </div>
        );
    }

    if (!user) {
        return <Landing />;
    }

    return (
        <SocketProvider>
            <VoiceProvider>
                <Main />
            </VoiceProvider>
        </SocketProvider>
    );
};

export default Home;
