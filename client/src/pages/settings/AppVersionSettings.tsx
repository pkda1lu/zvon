import React from 'react';
import { getBrand } from '../../utils/branding';

const AppVersionSettings: React.FC = () => {
    const brand = getBrand();
    const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.4.0';
    const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString();
    const commitHash = typeof __GIT_COMMIT_HASH__ !== 'undefined' ? __GIT_COMMIT_HASH__ : 'a11addbbad81ca254ac90a920d0c13b1abc516b6';
    const commitShortHash = typeof __GIT_COMMIT_SHORT_HASH__ !== 'undefined' ? __GIT_COMMIT_SHORT_HASH__ : commitHash.substring(0, 7);
    const commitAuthor = typeof __GIT_COMMIT_AUTHOR__ !== 'undefined' ? __GIT_COMMIT_AUTHOR__ : 'pkda1lu';
    const commitMessage = typeof __GIT_COMMIT_MESSAGE__ !== 'undefined' ? __GIT_COMMIT_MESSAGE__ : '';

    const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
    const platformDisplay = isElectron ? 'Desktop (Electron)' : 'Веб-версия (Браузер)';

    const [authorAvatar, setAuthorAvatar] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!commitAuthor) return;
        let isMounted = true;
        // Try fetching author avatar from GitHub API using commit author username or hash
        const fetchAvatar = async () => {
            try {
                if (commitHash) {
                    const res = await fetch(`https://api.github.com/repos/pkda1lu/zvon/commits/${commitHash}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (isMounted && data.author?.avatar_url) {
                            setAuthorAvatar(data.author.avatar_url);
                            return;
                        }
                    }
                }
                const res = await fetch(`https://api.github.com/users/${commitAuthor}`);
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted && data.avatar_url) {
                        setAuthorAvatar(data.avatar_url);
                    }
                }
            } catch (e) {
                console.error('Failed to fetch commit author avatar:', e);
            }
        };
        fetchAvatar();
        return () => {
            isMounted = false;
        };
    }, [commitAuthor, commitHash]);

    const formattedBuildDate = (() => {
        try {
            const date = new Date(buildTime);
            if (isNaN(date.getTime())) return buildTime;
            return new Intl.DateTimeFormat('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(date);
        } catch {
            return buildTime;
        }
    })();

    const commitUrl = `https://github.com/pkda1lu/zvon/commit/${commitHash}`;
    const repoUrl = `https://github.com/pkda1lu/zvon`;

    return (
        <div className="settings-content-inner">
            <h2 className="settings-page-title">Текущая версия</h2>
            <p className="settings-description">
                Информация о текущей сборке клиента, платформе и коммите GitHub.
            </p>

            {/* Version Hero Card with 2 Background Orbs */}
            <div className="app-version-hero-card">
                <div className="app-version-hero-orb orb-1" />
                <div className="app-version-hero-orb orb-2" />
                <div className="app-version-hero-content">
                    <div className="app-version-hero-left">
                        <h1 className="app-version-hero-title">{brand.name}</h1>
                        <span className="app-version-hero-tag">v{version}</span>
                    </div>
                </div>
            </div>

            {/* Build Info Card in Standard Settings Style */}
            <div className="settings-card">
                <h3 className="settings-section-title">Сведения о сборке</h3>

                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Номер версии</h3>
                        <p>Текущая релизная версия клиента</p>
                    </div>
                    <span className="settings-plain-value font-mono">v{version}</span>
                </div>

                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Дата и время билда</h3>
                        <p>Точное время сборки релиза</p>
                    </div>
                    <span className="settings-plain-value font-mono">{formattedBuildDate}</span>
                </div>

                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Платформа</h3>
                        <p>Текущая среда выполнения приложения</p>
                    </div>
                    <span className={`app-platform-detail-badge ${isElectron ? 'electron' : 'web'}`}>
                        {platformDisplay}
                    </span>
                </div>
            </div>

            {/* Git Commit Card in Standard Settings Style */}
            <div className="settings-card">
                <h3 className="settings-section-title">Исходный коммит</h3>

                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Хэш коммита</h3>
                        <p>Уникальный SHA идентификатор сборки в Git</p>
                    </div>
                    <a 
                        href={commitUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="changelog-commit-sha"
                        title="Открыть коммит на GitHub"
                    >
                        {commitShortHash}
                    </a>
                </div>

                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Автор</h3>
                        <p>Разработчик последнего коммита</p>
                    </div>
                    <div className="app-author-chip">
                        {authorAvatar ? (
                            <img src={authorAvatar} alt={commitAuthor} className="app-author-avatar" style={{ objectFit: 'cover' }} />
                        ) : (
                            <div className="app-author-avatar">
                                {commitAuthor.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <span className="app-author-name">{commitAuthor}</span>
                    </div>
                </div>

                {commitMessage && (
                    <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                        <div className="settings-row-text">
                            <h3>Сообщение</h3>
                            <p>Описание изменений в коммите</p>
                        </div>
                        <div className="app-commit-msg-box" style={{ width: '100%', boxSizing: 'border-box' }}>
                            {commitMessage}
                        </div>
                    </div>
                )}
            </div>

            {/* Repository Card in Standard Settings Style */}
            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Исходный код</h3>
                        <p>Официальный репозиторий проекта на GitHub</p>
                    </div>
                    <a 
                        href={repoUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="settings-btn secondary"
                        style={{ textDecoration: 'none' }}
                    >
                        GitHub
                    </a>
                </div>
            </div>

            {/* Prod by Vlyne Card */}
            <div className="settings-card">
                <div className="settings-row">
                    <div className="settings-row-text">
                        <h3>Prod by Vlyne</h3>
                        <p>Быстрые и стабильные Vless-решения</p>
                    </div>
                    <a 
                        href="https://t.me/vless_outline_channel" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="settings-btn secondary"
                        style={{ textDecoration: 'none', background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)' }}
                    >
                        Telegram
                    </a>
                </div>
            </div>
        </div>
    );
};

export default AppVersionSettings;
