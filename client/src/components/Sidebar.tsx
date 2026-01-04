import React, { useState } from 'react';
import { User, Server } from '../types';
import SettingsModal from './SettingsModal';
import JoinServerModal from './JoinServerModal';
import { getAvatarUrl } from '../utils/avatar';
import './Sidebar.css';

interface SidebarProps {
  user: User;
  servers: Server[];
  selectedServer: Server | null;
  onServerSelect: (server: Server) => void;
  onCreateServer: (name: string) => void;
  onServerJoined: (server: Server) => void;
  onLogout: () => void;
  onShowFriends: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  user,
  servers,
  selectedServer,
  onServerSelect,
  onCreateServer,
  onServerJoined,
  onLogout,
  onShowFriends
}) => {
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  return (
    <div className="sidebar">
      <div className="sidebar-servers">
        <div className="server-icon home-icon" onClick={onShowFriends} title="Друзья">
          <span>👥</span>
        </div>
        <div className="server-icon home-icon" onClick={() => setShowJoinModal(true)} title="Добавить сервер">
          <span>+</span>
        </div>
        {servers.map((server) => (
          <div
            key={server._id}
            className={`server-icon ${selectedServer?._id === server._id ? 'active' : ''}`}
            onClick={() => onServerSelect(server)}
            title={server.name}
          >
            {server.icon ? (
              <img src={server.icon} alt={server.name} />
            ) : (
              <span>{server.name.charAt(0).toUpperCase()}</span>
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
          ⚙️
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
    </div>
  );
};

export default Sidebar;

