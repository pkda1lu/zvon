import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getFullUrl } from '../utils/avatar';
import { BotIcon, LayoutGridIcon, PlusIcon, MonitorIcon } from './Icons';
import { useDialog } from '../contexts/DialogContext';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { User, Server } from '../types';
import ActiveContacts from './ActiveContacts';
import { useAppearance } from '../contexts/AppearanceContext';
import './ShowcaseView.css';

interface ShowcaseViewProps {
    onOpenMiniApp: (app: any) => void;
    onBack?: () => void;
    isMobile?: boolean;
    friends?: User[];
    servers?: Server[];
    onUserClick?: (userId: string, event?: React.MouseEvent) => void;
}

const ShowcaseView: React.FC<ShowcaseViewProps> = ({ onOpenMiniApp, onBack, isMobile, friends = [], servers = [], onUserClick = () => {} }) => {
    const { user: currentUser } = useAuth();
    const { socket } = useSocket();
    const { interfaceScale } = useAppearance();
    const [activeTab, setActiveTab] = useState<'all' | 'bots' | 'miniapps'>('all');
    const [showcaseData, setShowcaseData] = useState<{ bots: any[], miniApps: any[] }>({ bots: [], miniApps: [] });
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [userServers, setUserServers] = useState<any[]>([]);
    const [showServerSelect, setShowServerSelect] = useState<string | null>(null);
    const { alert, prompt } = useDialog();

    const reportItem = async (type: 'bot' | 'miniapp', id: string, name: string) => {
        const description = await prompt(`Пожаловаться на «${name}». Опиши проблему:`, '');
        if (!description) return;
        try {
            await axios.post('/api/moderation/report', {
                [type === 'bot' ? 'userId' : 'miniAppId']: id,
                reason: 'inappropriate_content',
                description,
            });
            await alert('Спасибо! Жалоба отправлена модераторам.');
        } catch (e: any) {
            await alert('Не удалось отправить жалобу: ' + (e?.response?.data?.message || 'ошибка'));
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [showcaseRes, serversRes] = await Promise.all([
                    axios.get('/api/showcase'),
                    axios.get('/api/servers/me')
                ]);
                setShowcaseData(showcaseRes.data);
                setUserServers(serversRes.data);
            } catch (err) {
                console.error('Failed to fetch showcase data', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const addBotToServer = async (botId: string, serverId: string) => {
        try {
            await axios.post(`/api/bots/${botId}/add-to-server`, { serverId });
            await alert('Бот успешно добавлен на сервер!');
            setShowServerSelect(null);
        } catch (e: any) {
            await alert(e.response?.data?.message || 'Ошибка при добавлении бота');
        }
    };

    const handleOpenApp = (app: any) => {
        // Activity is computed centrally in Main based on game vs open mini-apps.
        onOpenMiniApp(app);
    };

    const filteredBots = showcaseData.bots.filter(b => b.username.toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredApps = showcaseData.miniApps.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()));

    // Русские склонения: 1 бот / 2 бота / 5 ботов.
    const plural = (n: number, one: string, few: string, many: string) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
        return many;
    };

    // В подзаголовке — то, что реально помогает: сколько всего доступно
    // в текущем фильтре. Слоган здесь не нужен, пользователь уже внутри приложения.
    const counters: string[] = [];
    if (activeTab !== 'miniapps') counters.push(`${filteredBots.length} ${plural(filteredBots.length, 'бот', 'бота', 'ботов')}`);
    if (activeTab !== 'bots') counters.push(`${filteredApps.length} ${plural(filteredApps.length, 'приложение', 'приложения', 'приложений')}`);
    const countLabel = loading ? 'Загрузка…' : counters.join(' · ');

    const renderBotCard = (bot: any) => (
        <div key={bot._id} className="showcase-profile-card">
            <div 
                className="profile-card-banner" 
                style={bot.banner
                    ? { backgroundImage: `url(${getFullUrl(bot.banner)})` }
                    : { background: 'linear-gradient(135deg, rgba(49, 92, 255, 0.45), rgba(118, 28, 255, 0.28))' }}
            >
                <div className="profile-card-badge bot">Бот</div>
            </div>
            <div className="profile-card-content">
                <div className="profile-card-header">
                    <div className="profile-card-avatar">
                        {bot.avatar ? <img src={getFullUrl(bot.avatar)!} alt="" /> : <BotIcon size={26 * interfaceScale} color="var(--sc-accent-blue, #315cff)" />}
                    </div>
                    <div className="profile-card-main-info">
                        <div className="profile-card-name">{bot.username}</div>
                        <div className="profile-card-bio">{bot.bio || 'У этого бота пока нет описания.'}</div>
                    </div>
                </div>
                <div className="profile-card-actions">
                    <button
                        className="report-icon-btn"
                        title="Пожаловаться"
                        onClick={(e) => { e.stopPropagation(); reportItem('bot', bot._id, bot.username); }}
                    >
                        <svg width={14 * interfaceScale} height={14 * interfaceScale} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                            <line x1="4" y1="22" x2="4" y2="15"/>
                        </svg>
                    </button>
                    <div className="action-button-container">
                        <button className="showcase-action-btn primary" onClick={() => setShowServerSelect(showServerSelect === bot._id ? null : bot._id)}>
                            <PlusIcon size={18 * interfaceScale} />
                            <span>Добавить</span>
                        </button>
                        {showServerSelect === bot._id && (
                            <div className="card-server-selector custom-scrollbar">
                                {userServers.map(server => (
                                    <div key={server._id} className="server-option" onClick={() => addBotToServer(bot._id, server._id)}>
                                        {server.name}
                                    </div>
                                ))}
                                {userServers.length === 0 && <div className="server-option" style={{ opacity: 0.5, cursor: 'default' }}>Нет серверов</div>}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    const renderAppCard = (app: any) => (
        <div key={app._id} className="showcase-profile-card">
            <div 
                className="profile-card-banner" 
                style={app.banner
                    ? { backgroundImage: `url(${getFullUrl(app.banner)})` }
                    : { background: 'linear-gradient(135deg, rgba(118, 28, 255, 0.42), rgba(49, 92, 255, 0.24))' }}
            >
                <div className="profile-card-badge app">Приложение</div>
            </div>
            <div className="profile-card-content">
                <div className="profile-card-header">
                    <div className="profile-card-avatar">
                        {app.avatar ? <img src={getFullUrl(app.avatar)!} alt="" /> : <LayoutGridIcon size={26 * interfaceScale} color="var(--sc-accent-purple, #761cff)" />}
                    </div>
                    <div className="profile-card-main-info">
                        <div className="profile-card-name">{app.name}</div>
                        <div className="profile-card-bio">{app.description || 'У этого приложения пока нет описания.'}</div>
                    </div>
                </div>
                <div className="profile-card-actions">
                    <button
                        className="report-icon-btn"
                        title="Пожаловаться"
                        onClick={(e) => { e.stopPropagation(); reportItem('miniapp', app._id, app.name); }}
                    >
                        <svg width={14 * interfaceScale} height={14 * interfaceScale} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                            <line x1="4" y1="22" x2="4" y2="15"/>
                        </svg>
                    </button>
                    <button className="showcase-action-btn secondary" onClick={() => handleOpenApp(app)}>
                        <MonitorIcon size={18 * interfaceScale} />
                        <span>Открыть</span>
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="showcase-panel">
            {/* Фон намеренно приглушён: сначала читаются интеграции, потом декор. */}
            <div className="showcase-bg" aria-hidden="true">
                <div className="showcase-bg__glow showcase-bg__glow--blue" />
                <div className="showcase-bg__glow showcase-bg__glow--violet" />
                <div className="showcase-bg__sheen" />
            </div>

            <div className="showcase-main-container">
                <div className="showcase-left-section">
                    <header className="showcase-header">
                        <h1 className="showcase-header__title">Витрина</h1>
                        <span className="showcase-header__count">{countLabel}</span>
                    </header>

                    <div className="showcase-tabs">
                        <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>Все</button>
                        <button className={activeTab === 'bots' ? 'active' : ''} onClick={() => setActiveTab('bots')}>Боты</button>
                        <button className={activeTab === 'miniapps' ? 'active' : ''} onClick={() => setActiveTab('miniapps')}>Приложения</button>
                        
                        <div className="showcase-search-wrapper">
                            <input
                                type="text"
                                placeholder="Поиск интеграций..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="showcase-search-input"
                            />
                        </div>
                    </div>

                    <div className="showcase-list custom-scrollbar">
                        {loading ? (
                            <div className="showcase-loading">
                                <span>Загрузка витрины...</span>
                            </div>
                        ) : (
                            <>
                                {(activeTab === 'all' || activeTab === 'bots') && filteredBots.map(renderBotCard)}
                                {(activeTab === 'all' || activeTab === 'miniapps') && filteredApps.map(renderAppCard)}
                                {filteredBots.length === 0 && filteredApps.length === 0 && (
                                    <div className="showcase-empty">
                                        <LayoutGridIcon size={40} color="rgba(255,255,255,0.25)" />
                                        <p>Ничего не найдено</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
                {!isMobile && (
                    <ActiveContacts
                        friends={currentUser ? [...friends, currentUser] : friends}
                        servers={servers}
                        onUserClick={onUserClick}
                    />
                )}
            </div>
        </div>
    );
};

export default ShowcaseView;
