import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
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
        return <Navigate to="/login" replace />;
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
