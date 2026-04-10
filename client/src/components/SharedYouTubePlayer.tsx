import React, { useEffect, useRef, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { MaximizeIcon, MinimizeIcon, VolumeHighIcon, VolumeLowIcon, FullscreenIcon, PlayIcon } from './Icons';
import './SharedYouTubePlayer.css';

interface SharedYouTubePlayerProps {
  channelId: string;
  youtubeId: string;
  isHost: boolean;
  onStop: () => void;
  initialTime?: number;
  initialPlaying?: boolean;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

const SharedYouTubePlayer: React.FC<SharedYouTubePlayerProps> = ({ channelId, youtubeId, isHost, onStop, initialTime, initialPlaying }) => {
  const { socket } = useSocket();
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const syncInterval = useRef<any>(null);
  const isInternalChange = useRef(false);

  useEffect(() => {
    // Load YouTube API
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initPlayer = () => {
      playerRef.current = new window.YT.Player(`yt-player-${channelId}`, {
        videoId: youtubeId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          showinfo: 0
        },
        events: {
          onReady: onPlayerReady,
          onStateChange: onPlayerStateChange
        }
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    // Socket listeners for sync
    if (socket) {
      socket.on('yt-watch-state', (state: any) => {
        if (!state) return;
        if (!isHost && playerRef.current && playerRef.current.seekTo) {
          const localTime = playerRef.current.getCurrentTime();
          const remoteTime = state.currentTime;
          
          // Only seek if difference is more than 2 seconds
          if (Math.abs(localTime - remoteTime) > 2) {
            isInternalChange.current = true;
            playerRef.current.seekTo(remoteTime, true);
          }

          if (state.playing) {
            playerRef.current.playVideo();
          } else {
            playerRef.current.pauseVideo();
          }
        }
      });
    }

    return () => {
      if (syncInterval.current) clearInterval(syncInterval.current);
      if (playerRef.current) playerRef.current.destroy();
      if (socket) socket.off('yt-watch-state');
    };
  }, [youtubeId, channelId, isHost, socket]);

  const onPlayerReady = (event: any) => {
    setDuration(event.target.getDuration());
    event.target.setVolume(volume);
    
    // Handle initial sync
    if (!isHost) {
      if (initialTime !== undefined) {
        event.target.seekTo(initialTime, true);
      }
      if (initialPlaying === false) {
        event.target.pauseVideo();
      } else {
        event.target.playVideo();
      }
    }
    
    if (isHost) {
      syncInterval.current = setInterval(() => {
        if (playerRef.current && playerRef.current.getCurrentTime) {
          const time = playerRef.current.getCurrentTime();
          const playing = playerRef.current.getPlayerState() === 1; // 1 is playing
          setCurrentTime(time);
          setIsPlaying(playing);
          
          socket?.emit('yt-watch-sync', {
            channelId,
            state: { currentTime: time, playing }
          });
        }
      }, 2000);
    }
  };

  const onPlayerStateChange = (event: any) => {
    const state = event.data;
    setIsPlaying(state === 1);
    
    if (isHost && !isInternalChange.current) {
      socket?.emit('yt-watch-sync', {
        channelId,
        state: { 
          currentTime: playerRef.current.getCurrentTime(), 
          playing: state === 1 
        }
      });
    }
    isInternalChange.current = false;
  };

  const togglePlay = () => {
    if (!isHost) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isHost) return;
    const time = parseFloat(e.target.value);
    playerRef.current.seekTo(time, true);
    setCurrentTime(time);
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setVolume(val);
    playerRef.current.setVolume(val);
    if (val > 0) setIsMuted(false);
  };

  const toggleMute = () => {
    if (isMuted) {
      playerRef.current.unMute();
      setIsMuted(false);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map(v => v.toString().padStart(2, '0')).filter((v, i) => v !== '00' || i > 0).join(':');
  };

  return (
    <div 
      className={`yt-shared-container ${!showControls ? 'hide-controls' : ''}`}
      ref={containerRef}
      onMouseMove={() => {
        setShowControls(true);
        const timer = setTimeout(() => setShowControls(false), 3000);
        return () => clearTimeout(timer);
      }}
    >
      <div id={`yt-player-${channelId}`} className="yt-player-iframe" />
      
      <div className="yt-controls">
        <div className="yt-progress-bar">
          <input 
            type="range" 
            min="0" 
            max={duration || 100} 
            value={currentTime} 
            onChange={handleSeek}
            disabled={!isHost}
          />
        </div>
        
        <div className="yt-buttons">
          <div className="yt-buttons-left">
            <button className="yt-btn" onClick={togglePlay} disabled={!isHost}>
              {isPlaying ? <span className="pause-icon">II</span> : <PlayIcon size={20} />}
            </button>
            <div className="yt-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
            <div className="yt-volume-wrap">
              <button className="yt-btn" onClick={toggleMute}>
                {isMuted || volume === 0 ? <VolumeLowIcon size={20} /> : <VolumeHighIcon size={20} />}
              </button>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={isMuted ? 0 : volume} 
                onChange={handleVolume}
              />
            </div>
          </div>
          
          <div className="yt-buttons-right">
            {isHost && (
              <button className="yt-btn stop-btn" onClick={onStop} title="Stop sharing">
                &times;
              </button>
            )}
            <button className="yt-btn" onClick={() => containerRef.current?.requestFullscreen()} title="Fullscreen">
              <FullscreenIcon size={20} />
            </button>
          </div>
        </div>
      </div>
      
      {!isHost && (
        <div className="yt-host-badge">
          Host is controlling playback
        </div>
      )}
    </div>
  );
};

export default SharedYouTubePlayer;
