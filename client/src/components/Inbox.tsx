import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useInbox, InboxItem } from '../contexts/InboxContext';
import { TrashIcon, CheckIcon, MailIcon } from './Icons';
import UserAvatar from './UserAvatar';
import UserBadges, { resolveServerTag } from './UserBadges';
import { iosSpring } from '../animations/transitions';
import './Inbox.css';
import AwardNotification from './AwardNotification';
import ProblemReportModal from './ProblemReportModal';
import NotificationSources from './NotificationSources';
import { CloseIcon, SettingsIcon } from './Icons';

interface InboxProps {
    onClose: () => void;
    onItemClick: (item: InboxItem) => void;
    onOpenModerationHistory: () => void;
}

const Inbox: React.FC<InboxProps> = ({ onClose, onItemClick, onOpenModerationHistory }) => {
    const { items, markAsRead, markAllAsRead, removeItem } = useInbox();
    const [expandedId, setExpandedId] = React.useState<string | null>(null);
    const [showReport, setShowReport] = React.useState(false);
    const [activeTab, setActiveTab] = React.useState('all');
    const [query, setQuery] = React.useState('');
    const [unreadOnly, setUnreadOnly] = React.useState(false);
    const [showSources, setShowSources] = React.useState(false);
    const tabs = [
        { id: 'all', label: 'Все', accepts: (_item: InboxItem) => true },
        { id: 'mentions', label: 'Упоминания', accepts: (item: InboxItem) => item.type === 'mention' },
        { id: 'social', label: 'Общение', accepts: (item: InboxItem) => item.type === 'dm' || item.type === 'friend_request' },
        { id: 'moderation', label: 'Модерация', accepts: (item: InboxItem) => item.type === 'moderation' },
        { id: 'awards', label: 'Награды', accepts: (item: InboxItem) => item.type === 'award' },
    ];
    const [isMobile, setIsMobile] = React.useState(() => window.matchMedia('(max-width: 768px)').matches);
    React.useEffect(() => {
        const media = window.matchMedia('(max-width: 768px)');
        const update = () => setIsMobile(media.matches);
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);

    const selectedTab = tabs.find(tab => tab.id === activeTab)!;
    const needle = query.trim().toLocaleLowerCase('ru-RU');
    const filteredItems = items.filter(item => selectedTab.accepts(item)
        && (!unreadOnly || !item.read)
        && (!needle || [item.title, item.content, item.author?.username].join(' ').toLocaleLowerCase('ru-RU').includes(needle)));
    const unreadCount = items.filter(item => !item.read).length;

    const toggleMessage = (item: InboxItem) => {
        setExpandedId(previous => previous === item.id ? null : item.id);
        markAsRead(item.id);
    };

    const formatDate = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        if (days < 7) return date.toLocaleDateString('ru-RU', { weekday: 'short' });
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    };

    return createPortal(
        <motion.div
            className={`inbox-overlay ${isMobile ? 'is-mobile' : ''}`}
            initial={isMobile ? { x: '100%', opacity: 0 } : { x: 24, opacity: 0, scale: 0.98 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={isMobile ? { x: '100%', opacity: 0 } : { x: 24, opacity: 0, scale: 0.98 }}
            transition={iosSpring}
            style={{ transformOrigin: 'top right' }}
        >
            <div className="inbox-header">
                {isMobile && (
                    <button className="back-button" onClick={onClose} style={{ marginRight: '12px' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    </button>
                )}
                <h3>Уведомления {unreadCount > 0 && <span className="inbox-count">{unreadCount}</span>}</h3>
                <div className="inbox-actions">
                    <button type="button" className="inbox-item-btn" aria-label="Управление уведомлениями" aria-pressed={showSources} onClick={() => setShowSources(value => !value)}><SettingsIcon size={20} /></button>
                    {!isMobile && <button type="button" className="inbox-item-btn" aria-label="Закрыть уведомления" onClick={onClose}><CloseIcon size={20} /></button>}
                </div>
            </div>

            {!showSources && (
                <>
                    <div className="inbox-tabs" aria-label="Категории уведомлений">
                        {tabs.map(tab => {
                            const count = items.filter(item => tab.accepts(item) && !item.read).length;
                            return <button type="button" key={tab.id} className={`inbox-tab ${activeTab === tab.id ? 'active' : ''}`}
                                aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
                                {tab.label}{count > 0 && <span className="inbox-count">{count}</span>}
                            </button>;
                        })}
                    </div>
                    <div className="inbox-toolbar">
                        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти уведомление" aria-label="Поиск уведомлений" />
                        <label><input type="checkbox" checked={unreadOnly} onChange={event => setUnreadOnly(event.target.checked)} />Непрочитанные</label>
                    </div>
                    <div className="inbox-batch-actions">
                        <button type="button" className="inbox-action-btn" disabled={!unreadCount} onClick={markAllAsRead}>Прочитать все</button>
                        <button type="button" className="inbox-action-btn" disabled={!items.some(item => item.read)}
                            onClick={() => items.filter(item => item.read).forEach(item => removeItem(item.id))}>Удалить прочитанные</button>
                    </div>
                </>
            )}

            <div className="inbox-list">
                {showSources ? <NotificationSources /> : filteredItems.length === 0 ? (
                    <div className="inbox-empty">
                        <div className="inbox-empty-icon">📫</div>
                        <p>{query || unreadOnly ? 'По выбранным условиям уведомлений нет' : 'В этой категории пока нет уведомлений'}</p>
                    </div>
                ) : (
                    filteredItems.map(item => (
                        <div
                            key={item.id}
                            className={`inbox-item ${item.type} ${!item.read ? 'unread' : ''}`}
                            onClick={() => {
                                if (item.type === 'moderation' && ['moderation_message', 'moderation_violation', 'problem_resolved'].includes(item.target?.kind || '')) {
                                    toggleMessage(item);
                                    return;
                                }
                                onItemClick(item);
                                markAsRead(item.id);
                            }}
                        >
                            {item.type === 'award' && item.awardNotice ? <AwardNotification notice={item.awardNotice} onOpen={() => { onItemClick(item); markAsRead(item.id); }} /> : <><div className="inbox-item-avatar">
                                <UserAvatar user={item.author} size={48} />
                            </div>
                            <div className="inbox-item-body">
                                <div className="inbox-item-title">{item.title}</div>
                                <div className={`inbox-item-content ${expandedId === item.id ? 'is-expanded' : ''}`}>{item.content}</div>
                                {item.type === 'moderation' && (
                                    <button type="button" className="inbox-action-btn inbox-expand"
                                        aria-expanded={expandedId === item.id}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            toggleMessage(item);
                                        }}>
                                        {expandedId === item.id ? 'Свернуть' : 'Читать полностью'}
                                    </button>
                                )}
                                <div className="inbox-item-meta">
                                    <span>{item.author?.username}</span>
                                    {item.author && <UserBadges badges={item.author.badges} serverTag={resolveServerTag(item.author)} size={12} />}
                                    <span>{formatDate(item.timestamp)}</span>
                                </div>
                            </div>
                            </>}
                            <div className="inbox-item-actions">
                                {!item.read && (
                                    <button
                                        className="inbox-item-btn"
                                        title="Отметить как прочитанное"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            markAsRead(item.id);
                                        }}
                                    >
                                        <CheckIcon size={14} />
                                    </button>
                                )}
                                <button
                                    className="inbox-item-btn"
                                    title="Удалить"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeItem(item.id);
                                    }}
                                >
                                    <TrashIcon size={14} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
            <div className="inbox-support-actions">
                <button type="button" className="settings-btn secondary" onClick={onOpenModerationHistory}>Мои обращения</button>
                <button type="button" className="settings-btn secondary" onClick={() => setShowReport(true)}>Сообщить о проблеме</button>
            </div>
            <ProblemReportModal isOpen={showReport} onClose={() => setShowReport(false)} />
        </motion.div>, document.body
    );
};

export default Inbox;
