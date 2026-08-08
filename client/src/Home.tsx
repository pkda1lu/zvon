import React, { Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

// Тяжёлые ветки грузятся лениво:
//   AuthedApp — весь чат-апп вместе со стеком провайдеров (сокет, голос,
//               кейбинды, инбокс); рендерится только для авторизованных;
//   Landing   — маркетинговая страница (только для гостей в вебе).
// Важно: провайдеры импортируются внутри AuthedApp, а не здесь — иначе
// VoiceContext (а с ним livekit-client, ~420 КБ) попадает в entry-чанк,
// потому что Home статически импортируется из App.
const AuthedApp = React.lazy(() => import('./AuthedApp'));
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
            <AuthedApp />
        </Suspense>
    );
};

export default Home;
