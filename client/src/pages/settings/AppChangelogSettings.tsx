import React, { useState, useEffect } from 'react';
import { 
    ChevronDownIcon, 
    RotateCcwIcon,
    TagIcon
} from '../../components/Icons';

interface GitHubRelease {
    id: number;
    tag_name: string;
    name: string;
    published_at: string;
    body: string | null;
    html_url: string;
}

interface CommitItem {
    sha: string;
    shortSha: string;
    message: string;
    authorName: string;
    authorAvatar?: string;
    date: string;
    htmlUrl: string;
}

// Fallback release data if offline or GitHub API rate limit is reached
const FALLBACK_RELEASES: GitHubRelease[] = [
    {
        id: 366375414,
        tag_name: "v2.3.1",
        name: "2.3.1 — Мобильный интерфейс и жесты",
        published_at: "2026-08-06T19:12:54Z",
        body: "Масштабируемость, категории каналов, горячие клавиши и жесты, улучшенная мобильная адаптация.",
        html_url: "https://github.com/pkda1lu/zvon/releases/tag/v2.3.1"
    },
    {
        id: 366249429,
        tag_name: "v2.3.0",
        name: "2.3.0 — Модерация и боты",
        published_at: "2026-08-06T13:37:47Z",
        body: "Добавлена система ботов, личные токены, расширенная панель модерации и профили серверов.",
        html_url: "https://github.com/pkda1lu/zvon/releases/tag/v2.3.0"
    },
    {
        id: 364035279,
        tag_name: "v2.2.1",
        name: "2.2.1 — Оптимизация шума и звука",
        published_at: "2026-08-03T07:04:17Z",
        body: "Интеграция DeepFilterNet 3 для подавления шума в реальном времени и исправления голоса.",
        html_url: "https://github.com/pkda1lu/zvon/releases/tag/v2.2.1"
    },
    {
        id: 359343043,
        tag_name: "v2.1.4",
        name: "2.1.4 — Стримерский режим и оверлей",
        published_at: "2026-07-24T14:01:51Z",
        body: "Игровой оверлей Windows, скрытие конфиденциальной информации во время трансляций.",
        html_url: "https://github.com/pkda1lu/zvon/releases/tag/v2.1.4"
    },
    {
        id: 347394943,
        tag_name: "v2.1.0",
        name: "2.1.0 — Демонстрация экрана 60 FPS",
        published_at: "2026-07-01T10:58:11Z",
        body: "Шеринг экрана высокой четкости, поддержка аудио из захватываемых окон.",
        html_url: "https://github.com/pkda1lu/zvon/releases/tag/v2.1.0"
    },
    {
        id: 344868133,
        tag_name: "v2.0.0",
        name: "2.0.0 — Большое обновление Zvon 2.0",
        published_at: "2026-06-25T17:07:46Z",
        body: "Переработка архитектуры интерфейса, кастомные темы оформления, мини-приложения.",
        html_url: "https://github.com/pkda1lu/zvon/releases/tag/v2.0.0"
    }
];

const AppChangelogSettings: React.FC = () => {
    const [releases, setReleases] = useState<GitHubRelease[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
    const [commitsCache, setCommitsCache] = useState<Record<string, CommitItem[]>>({});
    const [loadingCommits, setLoadingCommits] = useState<Record<string, boolean>>({});

    // Unreleased commits state
    const [isUnreleasedExpanded, setIsUnreleasedExpanded] = useState<boolean>(false);
    const [unreleasedCommits, setUnreleasedCommits] = useState<CommitItem[] | null>(null);
    const [loadingUnreleased, setLoadingUnreleased] = useState<boolean>(false);

    const fetchReleases = async () => {
        setLoading(true);
        try {
            const res = await fetch('https://api.github.com/repos/pkda1lu/zvon/releases');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: GitHubRelease[] = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                setReleases(data);
            } else {
                setReleases(FALLBACK_RELEASES);
            }
        } catch {
            setReleases(FALLBACK_RELEASES);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReleases();
    }, []);

    const fetchUnreleasedCommits = async () => {
        if (unreleasedCommits !== null) return;
        setLoadingUnreleased(true);

        try {
            let commitsData: any[] = [];
            const latestTag = releases[0]?.tag_name || 'v2.3.1';

            const res = await fetch(`https://api.github.com/repos/pkda1lu/zvon/compare/${latestTag}...main`);
            if (res.ok) {
                const json = await res.json();
                commitsData = json.commits || [];
            } else {
                const resMaster = await fetch(`https://api.github.com/repos/pkda1lu/zvon/compare/${latestTag}...master`);
                if (resMaster.ok) {
                    const json = await resMaster.json();
                    commitsData = json.commits || [];
                }
            }

            const formattedCommits: CommitItem[] = commitsData.map((c: any) => ({
                sha: c.sha,
                shortSha: c.sha.substring(0, 7),
                message: c.commit?.message?.split('\n')[0] || 'Без сообщения',
                authorName: c.author?.login || c.commit?.author?.name || 'Developer',
                authorAvatar: c.author?.avatar_url,
                date: c.commit?.author?.date || '',
                htmlUrl: c.html_url || `https://github.com/pkda1lu/zvon/commit/${c.sha}`
            }));

            // GitHub compare API returns commits in chronological order (oldest first).
            // Reverse so newer commits appear higher (at the top).
            formattedCommits.reverse();

            setUnreleasedCommits(formattedCommits);
        } catch (e) {
            console.error('Failed to fetch unreleased commits:', e);
            setUnreleasedCommits([]);
        } finally {
            setLoadingUnreleased(false);
        }
    };

    const toggleUnreleasedExpand = () => {
        if (!isUnreleasedExpanded) {
            fetchUnreleasedCommits();
        }
        setIsUnreleasedExpanded(!isUnreleasedExpanded);
    };

    const fetchCommitsForRelease = async (releaseTag: string, prevReleaseTag: string | null) => {
        if (commitsCache[releaseTag]) return;

        setLoadingCommits(prev => ({ ...prev, [releaseTag]: true }));

        try {
            let commitsData: any[] = [];
            let isDirectCommitsEndpoint = false;

            if (prevReleaseTag) {
                const res = await fetch(`https://api.github.com/repos/pkda1lu/zvon/compare/${prevReleaseTag}...${releaseTag}`);
                if (res.ok) {
                    const json = await res.json();
                    commitsData = json.commits || [];
                }
            }

            if (commitsData.length === 0) {
                const res = await fetch(`https://api.github.com/repos/pkda1lu/zvon/commits?sha=${releaseTag}&per_page=100`);
                if (res.ok) {
                    const json = await res.json();
                    if (Array.isArray(json)) {
                        commitsData = json;
                        isDirectCommitsEndpoint = true;
                    }
                }
            }

            const formattedCommits: CommitItem[] = commitsData.map((c: any) => ({
                sha: c.sha,
                shortSha: c.sha.substring(0, 7),
                message: c.commit?.message?.split('\n')[0] || 'Без сообщения',
                authorName: c.author?.login || c.commit?.author?.name || 'Developer',
                authorAvatar: c.author?.avatar_url,
                date: c.commit?.author?.date || '',
                htmlUrl: c.html_url || `https://github.com/pkda1lu/zvon/commit/${c.sha}`
            }));

            // Compare API returns commits in chronological order (oldest first).
            // /commits endpoint returns commits in reverse-chronological order (newest first).
            if (!isDirectCommitsEndpoint) {
                formattedCommits.reverse();
            }

            setCommitsCache(prev => ({ ...prev, [releaseTag]: formattedCommits }));
        } catch (e) {
            console.error(`Failed to fetch commits for ${releaseTag}:`, e);
            setCommitsCache(prev => ({ ...prev, [releaseTag]: [] }));
        } finally {
            setLoadingCommits(prev => ({ ...prev, [releaseTag]: false }));
        }
    };

    const toggleExpand = (releaseTag: string, index: number) => {
        const nextSet = new Set(expandedTags);
        if (nextSet.has(releaseTag)) {
            nextSet.delete(releaseTag);
        } else {
            nextSet.add(releaseTag);
            const prevRelease = releases[index + 1];
            const prevTag = prevRelease ? prevRelease.tag_name : null;
            fetchCommitsForRelease(releaseTag, prevTag);
        }
        setExpandedTags(nextSet);
    };

    const formatDate = (isoString: string) => {
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return isoString;
            return new Intl.DateTimeFormat('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }).format(date);
        } catch {
            return isoString;
        }
    };

    const formatCommitDate = (isoString: string) => {
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return isoString;
            return new Intl.DateTimeFormat('ru-RU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            }).format(date);
        } catch {
            return isoString;
        }
    };

    return (
        <div className="settings-content-inner">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h2 className="settings-page-title" style={{ margin: 0 }}>История обновлений</h2>
                <button 
                    className="settings-btn settings-btn-secondary"
                    onClick={fetchReleases}
                    disabled={loading}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '10px', fontSize: '13px' }}
                    title="Обновить список релизов"
                >
                    <RotateCcwIcon size={16} className={loading ? 'spinning-icon' : ''} />
                    Обновить
                </button>
            </div>
            <p className="settings-description">
                Список релизов и коммитов с репозитория GitHub.
            </p>

            {loading ? (
                <div className="changelog-skeleton-list">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="changelog-skeleton-card">
                            <div className="skeleton-bar title" />
                            <div className="skeleton-bar text" />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="changelog-releases-list">
                    {/* Collapsed Unreleased Commits Item (without accent) */}
                    <div className={`changelog-release-card unreleased ${isUnreleasedExpanded ? 'expanded' : ''}`}>
                        <div className="changelog-card-top" onClick={toggleUnreleasedExpand}>
                            <div className="changelog-tag-badge-wrapper">
                                <span className="changelog-tag-badge muted">main</span>
                            </div>

                            <div className="changelog-card-title-group">
                                <h3 className="changelog-release-name muted">
                                    Коммиты без релиза
                                </h3>
                                <span className="changelog-release-date">в разработке</span>
                            </div>

                            <div className="changelog-expand-indicator">
                                <ChevronDownIcon size={20} className={isUnreleasedExpanded ? 'open' : ''} />
                            </div>
                        </div>

                        {/* Expanded Unreleased Commits */}
                        {isUnreleasedExpanded && (
                            <div className="changelog-commits-section">
                                <div className="changelog-commits-header">
                                    <h4>Коммиты версии</h4>
                                    {unreleasedCommits && unreleasedCommits.length > 0 && (
                                        <span className="changelog-commits-count-badge">
                                            {unreleasedCommits.length} {unreleasedCommits.length === 1 ? 'коммит' : unreleasedCommits.length < 5 ? 'коммита' : 'коммитов'}
                                        </span>
                                    )}
                                </div>

                                {loadingUnreleased ? (
                                    <div className="changelog-commits-loading">
                                        <div className="spinner" />
                                        <span>Загрузка коммитов...</span>
                                    </div>
                                ) : unreleasedCommits && unreleasedCommits.length > 0 ? (
                                    <div className="changelog-commits-timeline">
                                        {unreleasedCommits.map((commit) => (
                                            <div key={commit.sha} className="changelog-commit-row">
                                                <a 
                                                    href={commit.htmlUrl} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className="changelog-commit-sha"
                                                    title="Открыть коммит на GitHub"
                                                >
                                                    {commit.shortSha}
                                                </a>

                                                <div className="changelog-commit-info">
                                                    <div className="changelog-commit-message">
                                                        {commit.message}
                                                    </div>
                                                    <div className="changelog-commit-meta">
                                                        {commit.authorAvatar ? (
                                                            <img 
                                                                src={commit.authorAvatar} 
                                                                alt={commit.authorName} 
                                                                className="changelog-commit-avatar" 
                                                            />
                                                        ) : (
                                                            <div className="changelog-commit-avatar-fallback">
                                                                {commit.authorName.charAt(0).toUpperCase()}
                                                            </div>
                                                        )}
                                                        <span className="changelog-commit-author">{commit.authorName}</span>
                                                        {commit.date && (
                                                            <span className="changelog-commit-date">
                                                                • {formatCommitDate(commit.date)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="changelog-commits-empty">
                                        <span>Все текущие изменения входят в опубликованный релиз.</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Official Releases List */}
                    {releases.map((release, index) => {
                        const isExpanded = expandedTags.has(release.tag_name);
                        const isLatest = index === 0;
                        const commits = commitsCache[release.tag_name];
                        const isLoadingCommits = loadingCommits[release.tag_name];

                        return (
                            <div 
                                key={release.id || release.tag_name} 
                                className={`changelog-release-card ${isExpanded ? 'expanded' : ''} ${isLatest ? 'latest' : ''}`}
                            >
                                <div className="changelog-card-top" onClick={() => toggleExpand(release.tag_name, index)}>
                                    <div className="changelog-tag-badge-wrapper">
                                        <a 
                                            href={release.html_url} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            className="changelog-tag-badge"
                                            onClick={(e) => e.stopPropagation()}
                                            title="Перейти к релизу на GitHub"
                                        >
                                            <TagIcon size={13} />
                                            {release.tag_name}
                                        </a>
                                        {isLatest && <span className="changelog-latest-pill">Свежий релиз</span>}
                                    </div>

                                    <div className="changelog-card-title-group">
                                        <h3 className="changelog-release-name">
                                            {release.name || `Релиз ${release.tag_name}`}
                                        </h3>
                                        <span className="changelog-release-date">
                                            {formatDate(release.published_at)}
                                        </span>
                                    </div>

                                    <div className="changelog-expand-indicator">
                                        <ChevronDownIcon size={20} className={isExpanded ? 'open' : ''} />
                                    </div>
                                </div>

                                {release.body && (
                                    <div className="changelog-body-text">
                                        {release.body.split('\n').map((line, i) => (
                                            <p key={i}>{line}</p>
                                        ))}
                                    </div>
                                )}

                                {/* Expanded Commits List */}
                                {isExpanded && (
                                    <div className="changelog-commits-section">
                                        <div className="changelog-commits-header">
                                            <h4>Коммиты версии</h4>
                                            {commits && commits.length > 0 && (
                                                <span className="changelog-commits-count-badge">
                                                    {commits.length} {commits.length === 1 ? 'коммит' : commits.length < 5 ? 'коммита' : 'коммитов'}
                                                </span>
                                            )}
                                        </div>

                                        {isLoadingCommits ? (
                                            <div className="changelog-commits-loading">
                                                <div className="spinner" />
                                                <span>Загрузка коммитов с GitHub...</span>
                                            </div>
                                        ) : commits && commits.length > 0 ? (
                                            <div className="changelog-commits-timeline">
                                                {commits.map((commit) => (
                                                    <div key={commit.sha} className="changelog-commit-row">
                                                        <a 
                                                            href={commit.htmlUrl} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer" 
                                                            className="changelog-commit-sha"
                                                            title="Открыть коммит на GitHub"
                                                        >
                                                            {commit.shortSha}
                                                        </a>

                                                        <div className="changelog-commit-info">
                                                            <div className="changelog-commit-message">
                                                                {commit.message}
                                                            </div>
                                                            <div className="changelog-commit-meta">
                                                                {commit.authorAvatar ? (
                                                                    <img 
                                                                        src={commit.authorAvatar} 
                                                                        alt={commit.authorName} 
                                                                        className="changelog-commit-avatar" 
                                                                    />
                                                                ) : (
                                                                    <div className="changelog-commit-avatar-fallback">
                                                                        {commit.authorName.charAt(0).toUpperCase()}
                                                                    </div>
                                                                )}
                                                                <span className="changelog-commit-author">{commit.authorName}</span>
                                                                {commit.date && (
                                                                    <span className="changelog-commit-date">
                                                                        • {formatCommitDate(commit.date)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="changelog-commits-empty">
                                                <span>Информация о коммитах недоступна.</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default AppChangelogSettings;
