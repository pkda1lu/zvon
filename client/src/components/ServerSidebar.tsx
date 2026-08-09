import React, { useState, useEffect, useRef, Suspense } from 'react';
import axios from 'axios';
import { Server, Channel, User } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { useSocket } from '../contexts/SocketContext';
import { HashtagIcon, SpeakerIcon, CubeIcon, PlusIcon, SettingsIcon, MicMutedIcon, DeafenedIcon, UserPlusIcon } from './Icons';
import { useAuth } from '../contexts/AuthContext';
import { useVoice, useVoiceLevels } from '../contexts/VoiceContext';
import { Permissions, hasPermission, computePermissions } from '../utils/permissions';
import './panel-hero.css';
import './ServerSidebar.css';
import UserAvatar from './UserAvatar';
import UserBadges, { resolveServerTag } from './UserBadges';
import VoiceControlPanel from './VoiceControlPanel';
import { ConnectionStates } from '../utils/livekitLazy';
import { useAppearance } from "../contexts/AppearanceContext";

// Модалки сайдбара открываются по действию пользователя, поэтому грузятся
// лениво — вместе со своими стилями (ChannelSettingsModal ~19 КБ CSS,
// CreateChannelModal ~13 КБ), которые иначе лежат в общем чанке приложения.
const CreateChannelModal = React.lazy(() => import('./CreateChannelModal'));
const ChannelSettingsModal = React.lazy(() => import('./ChannelSettingsModal'));
const CategorySettingsModal = React.lazy(() => import('./CategorySettingsModal'));
const InviteModal = React.lazy(() => import('./InviteModal'));
const MemberContextMenu = React.lazy(() => import('./MemberContextMenu'));

// Оверлеи ничего не занимают в потоке — пока грузится чанк, показывать нечего.
const LazyOverlay: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={null}>{children}</Suspense>
);

// Секунды с момента, когда в канале появился хотя бы 1 участник → "12:34" / "1:02:03".
const formatVoiceDuration = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const VoiceChannelTimer: React.FC<{ startedAt: number }> = ({ startedAt }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  return <span className="voice-channel-timer">{formatVoiceDuration((Date.now() - startedAt) / 1000)}</span>;
};

interface ServerSidebarProps {
  server: Server;
  selectedChannel: Channel | null;
  onChannelSelect: (channel: Channel) => void;
  onChannelCreated?: () => void;
  onUserClick: (userId: string, event?: React.MouseEvent) => void;
  onOpenSettings: () => void;
  onServerClick: () => void;
  unreadCounts: Record<string, number>;
  style?: React.CSSProperties;
}

type DragItemType = 'channel' | 'category' | 'voice-user';

interface DragPayload {
  type: DragItemType;
  id: string;
  categoryId?: string | null;
  fromChannelId?: string;
}

const ServerSidebar: React.FC<ServerSidebarProps> = ({
  server,
  selectedChannel,
  onChannelSelect,
  onChannelCreated,
  onUserClick,
  onOpenSettings,
  onServerClick,
  unreadCounts,
  style
}) => {
  const { interfaceScale } = useAppearance();
  const { user: currentUser } = useAuth();
  const { socket } = useSocket();
  const { joinChannel, userStates, activeChannelId, roomConnectionState } = useVoice();
  const { speakingUsers = new Set<string>() } = useVoiceLevels() || {};

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalCategoryId, setCreateModalCategoryId] = useState<string | undefined>(undefined);
  const [createModalType, setCreateModalType] = useState<'text' | 'voice' | 'room' | 'category' | undefined>(undefined);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [editingCategory, setEditingCategory] = useState<Channel | null>(null);
  const [voiceStates, setVoiceStates] = useState<Record<string, User[]>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, user: User } | null>(null);

  // Сворачивание категорий на клиенте
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Compute User Permissions
  const userPerms = currentUser ? computePermissions(currentUser._id, server) : 0n;
  const canManageGuild = hasPermission(userPerms, Permissions.MANAGE_GUILD);
  const canManageChannels = hasPermission(userPerms, Permissions.MANAGE_CHANNELS);
  const canInvite = hasPermission(userPerms, Permissions.CREATE_INSTANT_INVITE);
  const canMoveMembers = hasPermission(userPerms, Permissions.MOVE_MEMBERS);

  const toggleCategoryCollapse = (catId: string) => {
    setCollapsedCategories(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  const handleContextMenu = (e: React.MouseEvent, user: User) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, user });
  };

  // Voice start timers
  const voiceStartTimesRef = useRef<Record<string, number>>({});
  Object.keys(voiceStates).forEach(channelId => {
    const users = voiceStates[channelId] || [];
    if (users.length > 0) {
      const serverJoinTimes = users.map(u => u.joinedVoiceAt).filter((t): t is number => typeof t === 'number' && t > 0);
      if (serverJoinTimes.length > 0) {
        const earliest = Math.min(...serverJoinTimes);
        voiceStartTimesRef.current[channelId] = earliest;
      } else if (!voiceStartTimesRef.current[channelId]) {
        voiceStartTimesRef.current[channelId] = Date.now();
      }
    } else {
      delete voiceStartTimesRef.current[channelId];
    }
  });

  useEffect(() => {
    if (socket) {
      socket.emit('join-server', server._id);
      socket.on('server-voice-states', (states) => setVoiceStates(states));
      socket.on('voice-channel-users-update', (data) => {
        setVoiceStates(prev => ({ ...prev, [data.channelId]: data.users }));
      });
      return () => {
        socket.emit('leave-server', server._id);
        socket.off('server-voice-states');
        socket.off('voice-channel-users-update');
      };
    }
  }, [socket, server._id]);

  const handleChannelCreated = () => {
    if (onChannelCreated) onChannelCreated();
    setShowCreateModal(false);
  };

  // Sort all channels by position
  const sortedChannels = [...server.channels].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const userCategories = sortedChannels.filter(ch => ch.type === 'category');
  const uncategorizedChannels = sortedChannels.filter(ch => ch.type !== 'category' && !ch.category);

  const uncategorizedGroups = [
    { key: 'uncategorized-text', title: 'ТЕКСТОВЫЕ КАНАЛЫ', type: 'text' as const, channels: uncategorizedChannels.filter(ch => ch.type === 'text') },
    { key: 'uncategorized-voice', title: 'ГОЛОСОВЫЕ КАНАЛЫ', type: 'voice' as const, channels: uncategorizedChannels.filter(ch => ch.type === 'voice') },
    { key: 'uncategorized-room', title: '3D-КАНАЛЫ', type: 'room' as const, channels: uncategorizedChannels.filter(ch => ch.type === 'room' || (ch.type !== 'text' && ch.type !== 'voice')) },
  ];

  // Helper to render single channel item
  const renderChannelItem = (channel: Channel) => {
    const channelPerms = currentUser ? computePermissions(currentUser._id, server, channel) : 0n;
    if (!hasPermission(channelPerms, Permissions.VIEW_CHANNEL)) return null;

    const canEditThisChannel = hasPermission(channelPerms, Permissions.MANAGE_CHANNELS);

    let IconComponent = HashtagIcon;
    if (channel.type === 'voice') IconComponent = SpeakerIcon;
    if (channel.type === 'room') IconComponent = CubeIcon;

    return (
      <div key={channel._id}>
        <div
          className={`channel-item ${selectedChannel?._id === channel._id ? 'active' : ''} ${unreadCounts[channel._id] > 0 ? 'unread' : ''}`}
          onClick={() => {
            onChannelSelect(channel);
            if ((channel.type === 'voice' || channel.type === 'room') && activeChannelId !== channel._id) {
              joinChannel(channel._id);
            }
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
            <span className="channel-icon">
              {(channel.type === 'voice' || channel.type === 'room') && activeChannelId === channel._id ? (
                <div className={`voice-status-indicator sidebar-inline ${
                  roomConnectionState === ConnectionStates.Connecting ||
                  roomConnectionState === ConnectionStates.Reconnecting ? 'connecting' : ''
                }`}>
                  <div className="pulse-ring"></div>
                  <div className="status-dot"></div>
                </div>
              ) : channel.type === 'text' ? (
                '#'
              ) : (
                <IconComponent size={18} />
              )}
            </span>
            <span className={`channel-name ${channel.type !== 'text' ? 'channel-name--voice' : ''}`}>{channel.name}</span>
          </div>

          {(channel.type === 'voice' || channel.type === 'room') && voiceStates[channel._id] && voiceStates[channel._id].length > 0 && voiceStartTimesRef.current[channel._id] && (
            <VoiceChannelTimer startedAt={voiceStartTimesRef.current[channel._id]} />
          )}

          <div className="channel-actions">
            {(channel.type === 'text' || channel.type === 'room') && unreadCounts[channel._id] > 0 && (
              <div className="channel-unread-badge" style={{ marginRight: '4px' }}>{unreadCounts[channel._id]}</div>
            )}
            {canEditThisChannel && (
              <button className="channel-settings-icon" onClick={(e) => { e.stopPropagation(); setEditingChannel(channel); }}>
                <SettingsIcon size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Voice Users list if voice/room */}
        {(channel.type === 'voice' || channel.type === 'room') && voiceStates[channel._id] && voiceStates[channel._id].length > 0 && (
          <div className="voice-channel-users">
            {voiceStates[channel._id].map(u => (
              <div
                key={u._id}
                className={`voice-user-item ${speakingUsers.has(u._id) ? 'speaking' : ''}`}
                onClick={(e) => { e.stopPropagation(); onUserClick(u._id, e); }}
                onContextMenu={(e) => handleContextMenu(e, u)}
              >
                <div className={`voice-user-avatar ${speakingUsers.has(u._id) ? 'speaking' : ''}`}>
                  <UserAvatar
                    user={u}
                    avatarOverride={server.members.find(m => String((m.user as any)._id || m.user) === String(u._id))?.avatar || undefined}
                    size={24}
                  />
                </div>
                <div className="voice-user-name-row">
                  <span className={`voice-user-name ${speakingUsers.has(u._id) ? 'speaking' : ''}`}>
                    {server.members.find(m => String((m.user as any)._id || m.user) === String(u._id))?.nickname || u.displayName || u.username}
                  </span>
                  <UserBadges badges={u.badges} serverTag={resolveServerTag(u)} size={12} />
                </div>
                <div className="voice-user-icons">
                  {userStates.get(u._id)?.isScreenSharing && (
                    <div className="live-badge nano">ЭФИР</div>
                  )}
                  {((u as any).isDeafened || (u as any).isServerDeafened) ? (
                    <DeafenedIcon size={14} color="#f23f42" />
                  ) : ((u as any).isMuted || (u as any).isServerMuted) ? (
                    <MicMutedIcon size={14} color="#f23f42" />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="server-sidebar panel-hero" style={style}>
      <div className="panel-hero-bg" aria-hidden="true">
        <div className="blob cyan" />
        <div className="blob purple" />
        <div className="blob pink" />
      </div>

      <div className="server-header">
        <div className="server-header-left" onClick={onServerClick} style={{ cursor: 'pointer' }}>
          {server.icon ? (
            <div className="server-header-icon"><img src={getAvatarUrl(server.icon)!} alt="" /></div>
          ) : (
            <div className="server-header-icon-placeholder">{server.name.charAt(0).toUpperCase()}</div>
          )}
          <h2>{server.name}</h2>
        </div>
        <div className="server-header-actions">
          {canManageChannels && (
            <button
              className="invite-button"
              onClick={() => {
                setCreateModalCategoryId(undefined);
                setCreateModalType('category');
                setShowCreateModal(true);
              }}
              title="Создать категорию или канал"
            >
              <PlusIcon size={18 * interfaceScale} />
            </button>
          )}
          {canInvite && (
            <button className="invite-button" onClick={() => setShowInviteModal(true)} title="Пригласить друзей">
              <UserPlusIcon size={18 * interfaceScale} />
            </button>
          )}
          {canManageGuild && (
            <button className="settings-button" onClick={onOpenSettings} title="Настройки сервера">
              <SettingsIcon size={18 * interfaceScale} />
            </button>
          )}
        </div>
      </div>

      <div className="channels-list">
        {/* Render Custom Categories */}
        {userCategories.map((category) => {
          const categoryPerms = currentUser ? computePermissions(currentUser._id, server, category) : 0n;
          if (!hasPermission(categoryPerms, Permissions.VIEW_CHANNEL)) return null;

          const isCollapsed = !!collapsedCategories[category._id];
          const childChannels = sortedChannels.filter(ch => {
            const catId = typeof ch.category === 'object' ? (ch.category as any)?._id : ch.category;
            return String(catId) === String(category._id);
          });

          return (
            <div key={category._id} className="channel-category">
              <div className="category-header">
                <div className="category-header-title" onClick={() => toggleCategoryCollapse(category._id)}>
                  <span className={`category-collapse-icon ${isCollapsed ? 'collapsed' : ''}`}>▼</span>
                  <span>{category.name}</span>
                </div>
                <div className="category-header-actions">
                  {canManageChannels && (
                    <>
                      <button
                        className="add-channel-button"
                        onClick={() => { setCreateModalCategoryId(category._id); setShowCreateModal(true); }}
                        title="Создать канал в категории"
                      >
                        <PlusIcon size={14} />
                      </button>
                      <button
                        className="add-channel-button"
                        onClick={() => setEditingCategory(category)}
                        title="Настройки категории"
                      >
                        <SettingsIcon size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!isCollapsed && childChannels.map(ch => renderChannelItem(ch))}
            </div>
          );
        })}

        {/* Uncategorized Channels Section (grouped by channel type) */}
        {uncategorizedGroups.map(group => {
          if (group.channels.length === 0) return null;
          const isCollapsed = !!collapsedCategories[group.key];
          return (
            <div key={group.key} className="channel-category">
              <div className="category-header">
                <div className="category-header-title" onClick={() => toggleCategoryCollapse(group.key)}>
                  <span className={`category-collapse-icon ${isCollapsed ? 'collapsed' : ''}`}>▼</span>
                  <span>{group.title}</span>
                </div>
                <div className="category-header-actions">
                  {canManageChannels && (
                    <button
                      className="add-channel-button"
                      onClick={() => {
                        setCreateModalCategoryId(undefined);
                        setCreateModalType(group.type);
                        setShowCreateModal(true);
                      }}
                      title={`Создать ${group.type === 'text' ? 'текстовый' : group.type === 'voice' ? 'голосовой' : '3D'} канал`}
                    >
                      <PlusIcon size={14} />
                    </button>
                  )}
                </div>
              </div>

              {!isCollapsed && group.channels.map(ch => renderChannelItem(ch))}
            </div>
          );
        })}

        {/* Fallback if no categories and no uncategorized channels exist */}
        {userCategories.length === 0 && uncategorizedChannels.length === 0 && (
          <div className="channel-category">
            <div className="category-header">
              <span>КАНАЛЫ</span>
              {canManageChannels && (
                <button
                  className="add-channel-button"
                  onClick={() => { setCreateModalCategoryId(undefined); setCreateModalType(undefined); setShowCreateModal(true); }}
                  title="Создать канал"
                >
                  <PlusIcon size={18} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <LazyOverlay>
        <CreateChannelModal
          isOpen={showCreateModal}
          onClose={() => { setShowCreateModal(false); setCreateModalCategoryId(undefined); setCreateModalType(undefined); }}
          serverId={server._id}
          categories={userCategories}
          initialCategoryId={createModalCategoryId}
          initialType={createModalType}
          onChannelCreated={handleChannelCreated}
        />
        </LazyOverlay>
      )}

      {showInviteModal && (
        <LazyOverlay>
        <InviteModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          serverId={server._id}
          serverName={server.name}
        />
        </LazyOverlay>
      )}

      {editingChannel && (
        <LazyOverlay>
        <ChannelSettingsModal
          isOpen={!!editingChannel}
          onClose={() => setEditingChannel(null)}
          channel={editingChannel}
          server={server}
          onChannelUpdate={() => { if (onChannelCreated) onChannelCreated(); }}
          onChannelDelete={() => { if (onChannelCreated) onChannelCreated(); }}
        />
        </LazyOverlay>
      )}

      {editingCategory && (
        <LazyOverlay>
        <CategorySettingsModal
          isOpen={!!editingCategory}
          onClose={() => setEditingCategory(null)}
          category={editingCategory}
          server={server}
          onCategoryUpdate={() => { if (onChannelCreated) onChannelCreated(); }}
          onCategoryDelete={() => { if (onChannelCreated) onChannelCreated(); }}
        />
        </LazyOverlay>
      )}

      {contextMenu && (
        <LazyOverlay>
        <MemberContextMenu
          user={contextMenu.user}
          server={server}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onOpenProfile={onUserClick}
        />
        </LazyOverlay>
      )}

      <VoiceControlPanel />
    </div>
  );
};

export default React.memo(ServerSidebar);
