import React, { useState } from 'react';
import { Folder, FolderOpen, FolderPlus, ArrowLeft } from 'lucide-react';
import ServerFolderManager from './ServerFolderManager';
import { useServerFolders } from '../utils/useServerFolders';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Server, MiniApp } from '../types';
import JoinServerModal from './JoinServerModal';
import { getAvatarUrl } from '../utils/avatar';
import UserAvatar from './UserAvatar';
import { UsersIcon, PlusIcon, SettingsIcon, BellIcon, LayoutGridIcon, FlagIcon } from './Icons';
import ServerContextMenu from './ServerContextMenu';
import ProblemReportModal from './ProblemReportModal';
import { useAppearance } from '../contexts/AppearanceContext';
import { useLongPress } from '../utils/useLongPress';
import { iosSpringSnappy } from '../animations/transitions';
import './panel-hero.css';
import './Sidebar.css';

// iOS-style press feedback shared across every clickable server-icon button.
// Одна анимация для всех кнопок левой панели — как у иконок серверов.
// Раньше у витрины, «лички» и «+» к ней добавлялся CSS-сдвиг вверх, у своей
// аватарки — CSS-увеличение с поворотом, у колокольчика, жалобы и настроек —
// поворот на -8°: всё двигалось по-разному.
const pressFeedback = {
  whileTap: { scale: 0.88 },
  whileHover: { scale: 1.06 },
  transition: iosSpringSnappy,
};

interface SidebarProps {
  user: User;
  servers: Server[];
  unreadCounts: Record<string, number>;
  selectedServer: Server | null;
  onServerSelect: (server: Server) => void;
  onCreateServer: (name: string) => void;
  onServerJoined: (server: Server) => void;
  onLogout: () => void;
  onShowFriends: () => void;
  showFriends?: boolean;
  onShowShowcase: () => void;
  showShowcase?: boolean;
  onServerLeave: (serverId: string) => void;
  onOpenJoinModal: () => void;
  onOpenSettings: () => void;
  onOpenProfile: (userId: string, event?: React.MouseEvent, scopeless?: boolean) => void;
  onToggleInbox: () => void;
  inboxUnreadCount: number;
  minimizedMiniApps?: MiniApp[];
  onRestoreMiniApp?: (appId: string) => void;
  onCloseMiniApp?: (appId: string) => void;
  isMobile?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  user,
  servers,
  unreadCounts,
  selectedServer,
  onServerSelect,
  onCreateServer,
  onServerJoined,
  onLogout,
  onShowFriends,
  showFriends,
  onShowShowcase,
  showShowcase,
  onServerLeave,
  onOpenJoinModal,
  onOpenSettings,
  onOpenProfile,
  onToggleInbox,
  inboxUnreadCount,
  minimizedMiniApps = [],
  onRestoreMiniApp,
  onCloseMiniApp,
  isMobile = false,
}) => {
  const { interfaceScale } = useAppearance();
  const mutedServerIds = React.useMemo(
    () => new Set((user?.mutedServers || []).map(String)),
    [user?.mutedServers]);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, server: Server } | null>(null);
  const [showReport, setShowReport] = useState(false);

  const handleContextMenu = (e: React.MouseEvent, server: Server) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, server });
  };

  /*
   * На телефоне правого щелчка нет — то же меню открывается удержанием.
   * Сервер под пальцем запоминаем в touchstart: хук один на весь список.
   */
  const pressTargetRef = React.useRef<Server | null>(null);
  const longPress = useLongPress(({ x, y }) => {
    const server = pressTargetRef.current;
    if (server) setContextMenu({ x, y, server });
  });

  const { folders, saveFolders, synced } = useServerFolders(user);
  const [folderManager, setFolderManager] = useState<{ serverId?: string; folderId?: string } | null>(null);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const openFolder = folders.find(f => f.id === openFolderId);
  const isolated = !!openFolder?.isolated;
  const groupedIds = new Set(folders.flatMap(f => f.serverIds));

  // External navigation (quick switcher, notification, keyboard) reveals its folder.
  React.useEffect(() => {
    if (!selectedServer) return;
    const folder = folders.find(f => f.serverIds.includes(selectedServer._id));
    setOpenFolderId(folder?.id || null);
  }, [selectedServer?._id, folders]);

  const renderServer = (server: Server) => (
          <div key={server._id} className={`server-item ${selectedServer?._id === server._id ? 'active' : ''}`}>
            <div className="pill"><span /></div>
            <motion.div
              {...pressFeedback}
              {...longPress}
              className={`server-icon ${selectedServer?._id === server._id ? 'active' : ''} ${longPress.className}`}
              onClick={() => onServerSelect(server)}
              onContextMenu={(e) => handleContextMenu(e, server)}
              title={server.name}
              onTouchStart={(e) => { pressTargetRef.current = server; longPress.onTouchStart(e); }}
            >
              <UserAvatar
                user={{ username: server.name, avatar: server.icon }}
                size={48 * interfaceScale}
                className={`server-icon-avatar${mutedServerIds.has(String(server._id)) ? ' is-muted' : ''}`}
              />
              {/* У заглушённого сервера индикатор не показываем — в этом и смысл
                  заглушения. Сам сервер остаётся на месте, только тусклее. */}
              {!mutedServerIds.has(String(server._id)) && server.channels.some(c => unreadCounts[c._id] > 0) && (
                <div className="unread-badge"></div>
              )}
            </motion.div>
          </div>
  );

  return (
    <div className="sidebar panel-hero">
      <div className="panel-hero-bg" aria-hidden="true">
        <div className="blob cyan" />
        <div className="blob purple" />
        <div className="blob pink" />
      </div>
      <div className="sidebar-servers">
        <div className={`server-item ${!selectedServer && !showShowcase ? 'active' : ''}`}>
          <div className="pill"><span /></div>
          <motion.div
            className={`server-icon friends-sidebar-icon ${!selectedServer && !showShowcase ? 'active' : ''}`}
            onClick={onShowFriends}
            title="Личные сообщения"
            {...pressFeedback}
          >
            <UsersIcon size={28 * interfaceScale} />
            {Object.entries(unreadCounts).some(([id, count]) => count > 0 && !servers.some(s => s.channels.some(c => c._id === id))) && (
              <div className="unread-badge"></div>
            )}
          </motion.div>
        </div>

        {!isMobile && (
          <div className={`server-item ${showShowcase ? 'active' : ''}`}>
            <div className="pill"><span /></div>
            <motion.div
              className={`server-icon showcase-sidebar-icon ${showShowcase ? 'active' : ''}`}
              onClick={onShowShowcase}
              title="Витрина ботов и мини-приложений"
              {...pressFeedback}
            >
              <LayoutGridIcon size={28 * interfaceScale} color="var(--accent-pink)" />
            </motion.div>
          </div>
        )}

        <AnimatePresence>
          {minimizedMiniApps.map(app => (
            <motion.div
              key={app._id}
              className="server-item"
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
            >
              <div className="pill"><span /></div>
              <motion.div
                className="server-icon miniapp-minimized-icon"
                onClick={() => onRestoreMiniApp?.(app._id)}
                onContextMenu={(e) => { e.preventDefault(); onCloseMiniApp?.(app._id); }}
                title={`${app.name} — нажми чтобы развернуть, ПКМ — закрыть`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                whileTap={{ scale: 0.88 }}
                whileHover={{ scale: 1.06 }}
                transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.7 }}
              >
                {app.avatar ? (
                  <img src={getAvatarUrl(app.avatar) || ''} alt={app.name} />
                ) : (
                  <LayoutGridIcon size={24 * interfaceScale} color="var(--accent-pink)" />
                )}
              </motion.div>
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="server-item">
          <div className="pill"><span /></div>
          <motion.div
            className="server-icon home-icon"
            onClick={onOpenJoinModal}
            title="Добавить сервер"
            {...pressFeedback}
          >
            <PlusIcon size={28 * interfaceScale} color="var(--primary-neon)" />
          </motion.div>
        </div>

        <div className="sidebar-divider" />
        
        <div className="server-item">
          <button className="server-folder__button" onClick={() => setFolderManager({})} title="Папки серверов" aria-label="Папки серверов"><FolderPlus size={24 * interfaceScale} /></button>
        </div>
        {isolated && <button className="server-folder__button server-folder__all" onClick={() => setOpenFolderId(null)} title="Все серверы" aria-label="Все серверы"><ArrowLeft size={24 * interfaceScale} /></button>}
        {folders.filter(folder => !isolated || folder.id === openFolderId).map(folder => {
          const members = servers.filter(server => folder.serverIds.includes(server._id));
          const expanded = folder.id === openFolderId;
          const hasUnread = members.some(server => !mutedServerIds.has(String(server._id)) && server.channels.some(channel => unreadCounts[channel._id] > 0));
          return <div className="server-folder" key={folder.id}>
            <button className={`server-folder__button ${members.some(server => server._id === selectedServer?._id) ? 'has-selected' : ''}`}
              aria-label={`${folder.name}, серверов: ${members.length}`} aria-expanded={expanded}
              title={`${folder.name} · ${members.length}${folder.isolated ? ' · изоляция' : ''}`}
              onClick={() => setOpenFolderId(expanded ? null : folder.id)}
              onContextMenu={event => { event.preventDefault(); setFolderManager({ folderId: folder.id }); }}>
              {expanded ? <FolderOpen size={26 * interfaceScale} /> : <Folder size={26 * interfaceScale} />}
              <span className="server-folder__count">{members.length}</span>
              {hasUnread && <span className="unread-badge" />}
            </button>
            {expanded && <div className="server-folder__children" role="group" aria-label={folder.name}>
              {members.map(renderServer)}
              {!members.length && <span className="server-folder__empty">Папка пуста</span>}
            </div>}
          </div>;
        })}
        {!isolated && servers.filter(server => !groupedIds.has(server._id)).map(renderServer)}
      </div>

      {!isMobile && (
        <div className="sidebar-user">
          <motion.div
            className="user-avatar-wrapper"
            title={`${user.username} (${user.status})`}
            onClick={() => onOpenProfile(user._id, undefined, true)}
            style={{ position: 'relative' }}
            {...pressFeedback}
          >
            <UserAvatar
              user={user}
              size={38 * interfaceScale}
              className="user-avatar"
            />
            <div className={`status-indicator ${user.status === 'offline' ? 'offline' : (user.activity?.type === 'streaming' ? 'streaming' : user.status)}`}></div>
          </motion.div>
          <div className="sidebar-user-actions">
            <motion.button
              className="logout-button"
              onClick={onToggleInbox}
              title="Уведомления"
              style={{ position: 'relative' }}
              {...pressFeedback}
            >
              <BellIcon size={18 * interfaceScale} />
              {inboxUnreadCount > 0 && <div className="unread-badge sidebar-user-badge">{inboxUnreadCount > 9 ? '9+' : inboxUnreadCount}</div>}
            </motion.button>
            <motion.button
              className="logout-button report-button"
              onClick={() => setShowReport(true)}
              title="Сообщить о проблеме"
              {...pressFeedback}
            >
              <FlagIcon size={18 * interfaceScale} />
            </motion.button>
            <motion.button
              className="logout-button"
              onClick={onOpenSettings}
              title="Настройки"
              {...pressFeedback}
            >
              <SettingsIcon size={20 * interfaceScale} />
            </motion.button>
          </div>
        </div>
      )}


      {contextMenu && (
        <ServerContextMenu
          server={contextMenu.server}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onLeave={onServerLeave}
          onOrganize={() => { setFolderManager({ serverId: contextMenu.server._id }); setContextMenu(null); }}
        />
      )}

      {folderManager && <ServerFolderManager key={user._id} folders={folders} servers={servers} initialServerId={folderManager.serverId} initialFolderId={folderManager.folderId} synced={synced} onClose={() => setFolderManager(null)} onSave={saveFolders} />}
      <ProblemReportModal isOpen={showReport} onClose={() => setShowReport(false)} />
    </div>
  );
};

export default React.memo(Sidebar);

