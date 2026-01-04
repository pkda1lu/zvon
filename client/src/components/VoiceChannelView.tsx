import React from 'react';
import { useVoice } from '../contexts/VoiceContext';
import { Channel } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getAvatarUrl } from '../utils/avatar';
import './VoiceChannelView.css';

interface VoiceChannelViewProps {
  channel: Channel;
}

const VoiceChannelView: React.FC<VoiceChannelViewProps> = ({ channel }) => {
  const { user } = useAuth();
  const {
    isConnected,
    activeChannelId,
    joinChannel,
    leaveChannel,
    isMuted,
    isDeafened,
    toggleMute,
    toggleDeafen,
    connectedUsers
  } = useVoice();

  // If connected to THIS channel, show the "connected" UI
  // If connected to ANOTHER channel, allow joining this one (which will switch)
  const isConnectedToThisChannel = isConnected && activeChannelId === channel._id;

  const handleConnect = () => {
    joinChannel(channel._id);
  };

  const handleDisconnect = () => {
    leaveChannel();
  };

  return (
    <div className="voice-channel-view">
      <div className="voice-channel-header">
        <div className="voice-channel-info">
          <span className="voice-channel-icon">🔊</span>
          <h3>{channel.name}</h3>
        </div>
        {channel.topic && (
          <div className="voice-channel-topic">{channel.topic}</div>
        )}
      </div>

      <div className="voice-channel-content">
        {!isConnectedToThisChannel ? (
          <div className="voice-channel-disconnected">
            <div className="voice-channel-icon-large">🔊</div>
            {isConnected ? (
              <>
                <h2>Вы подключены к другому каналу</h2>
                <p>Нажмите "Подключиться", чтобы перейти в этот канал</p>
              </>
            ) : (
              <>
                <h2>Вы не подключены к голосовому каналу</h2>
                <p>Нажмите кнопку ниже, чтобы подключиться</p>
              </>
            )}

            <button className="connect-voice-button" onClick={handleConnect}>
              <span className="button-icon">📞</span>
              Подключиться
            </button>
          </div>
        ) : (
          <div className="voice-channel-connected">
            <div className="connected-users-list">
              <h4>Участники ({connectedUsers.length + 1})</h4>

              {/* Me */}
              <div className="user-item">
                <div className="user-avatar-small">
                  {getAvatarUrl(user?.avatar) ? (
                    <img src={getAvatarUrl(user?.avatar)!} alt={user?.username} />
                  ) : (
                    <span>{user?.username.charAt(0).toUpperCase()}</span>
                  )}
                  {isMuted && <div className="mute-indicator">🔇</div>}
                  {isDeafened && <div className="mute-indicator">🚫</div>}
                </div>
                <span className="user-name">{user?.username} (Вы)</span>
              </div>

              {/* Others */}
              {connectedUsers.map((connectedUser) => (
                <div key={connectedUser._id} className="user-item">
                  <div className="user-avatar-small">
                    {getAvatarUrl(connectedUser.avatar) ? (
                      <img src={getAvatarUrl(connectedUser.avatar)!} alt={connectedUser.username} />
                    ) : (
                      <span>{connectedUser.username.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <span className="user-name">{connectedUser.username}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="voice-channel-controls">
        {isConnectedToThisChannel ? (
          <>
            <button
              className={`control-button ${isMuted ? 'muted' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            >
              {isMuted ? '🔇' : '🎤'}
            </button>
            <button
              className={`control-button ${isDeafened ? 'deafened' : ''}`}
              onClick={toggleDeafen}
              title={isDeafened ? 'Включить звук' : 'Выключить звук'}
            >
              {isDeafened ? '🚫' : '🔊'}
            </button>
            <button
              className="control-button disconnect"
              onClick={handleDisconnect}
              title="Отключиться"
            >
              📞
            </button>
          </>
        ) : (
          <div className="disconnected-message">
            {isConnected
              ? 'Нажмите "Подключиться" выше, чтобы сменить канал'
              : 'Нажмите "Подключиться" выше, чтобы присоединиться к голосовому каналу'
            }
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceChannelView;
