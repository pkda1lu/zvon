import React, { useState } from 'react';
import { User, Server } from '../types';
import SettingsModal from './SettingsModal';
import JoinServerModal from './JoinServerModal';
import { getAvatarUrl } from '../utils/avatar';
import { UsersIcon, PlusIcon, SettingsIcon } from './Icons';
import ServerContextMenu from './ServerContextMenu';
import './Sidebar.css';

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
  onServerLeave: (serverId: string) => void;
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
  onServerLeave
}) => {
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, server: Server } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, server: Server) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, server });
  };

  return (
    <div className="sidebar">
      <div className="sidebar-servers">
        <div className="server-icon home-icon" onClick={onShowFriends} title="Друзья">
          <UsersIcon size={28} />
          {Object.entries(unreadCounts).some(([id, count]) => count > 0 && !servers.some(s => s.channels.some(c => c._id === id))) && (
            <div className="unread-badge"></div>
          )}
        </div>
        <div className="server-icon home-icon" onClick={() => setShowJoinModal(true)} title="Добавить сервер">
          <PlusIcon size={28} color="#43b581" />
        </div>
        {servers.map((server) => (
          <div
            key={server._id}
            className={`server-icon ${selectedServer?._id === server._id ? 'active' : ''}`}
            onClick={() => onServerSelect(server)}
            onContextMenu={(e) => handleContextMenu(e, server)}
            title={server.name}
          >
            {server.icon ? (
              <img src={getAvatarUrl(server.icon)!} alt={server.name} />
            ) : (
              <span>{server.name.charAt(0).toUpperCase()}</span>
            )}
            {server.channels.some(c => unreadCounts[c._id] > 0) && (
              <div className="unread-badge"></div>
            )}
          </div>
        ))}
      </div>

      <div className="sidebar-user">
        <div className="user-avatar" title={`${user.username} (${user.status})`}>
          {getAvatarUrl(user.avatar) ? (
            <img src={getAvatarUrl(user.avatar)!} alt={user.username} />
          ) : (
            <span>{user.username.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <button className="logout-button" onClick={() => setShowSettingsModal(true)} title="Настройки">
          <SettingsIcon size={20} />
        </button>
      </div>

      {showSettingsModal && (
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {showJoinModal && (
        <JoinServerModal
          isOpen={showJoinModal}
          onClose={() => setShowJoinModal(false)}
          onJoin={(server: Server) => {
            onServerJoined(server);
          }}
          onCreate={onCreateServer}
        />
      )}

      {contextMenu && (
        <ServerContextMenu
          server={contextMenu.server}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onLeave={onServerLeave}
        />
      )}
    </div>
  );
};

export default Sidebar;

