// Совместный просмотр YouTube — пример коллаборативной мини-аппки на Zvon SDK.
// Один участник запускает видео (host), оно авто-открывается у всех в голосовом
// канале и синхронизируется через zvon.broadcast(). Только host управляет
// воспроизведением; остальные следуют за его временем/паузой.
(async function () {
  const sdk = window.zvon;
  const $ = (s) => document.querySelector(s);

  const init = await sdk.init();
  const user = await sdk.getUser();
  const me = user ? String(user._id) : ('anon-' + Math.random().toString(36).slice(2));

  // ---------- State ----------
  let player = null;          // YT.Player
  let ytReady = false;        // IFrame API loaded
  let playerReady = false;    // player instance ready
  let isHost = false;
  let hostUserId = null;
  let videoId = null;
  let pendingSync = null;     // {time, playing, ts} to apply once player is ready
  let syncTimer = null;       // host periodic sync
  let driftTimer = null;      // follower drift correction
  let suppressUntil = 0;      // ignore our own programmatic state changes
  let presence = null;        // host's voice-channel tile for this watch party
  let videoTitle = '';

  // ---------- YouTube IFrame API ----------
  window.onYouTubeIframeAPIReady = () => { ytReady = true; flushYT(); };
  (function loadYT() {
    if (window.YT && window.YT.Player) { ytReady = true; return; }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  })();
  const ytQueue = [];
  function whenYT(cb) { if (ytReady && window.YT && window.YT.Player) cb(); else ytQueue.push(cb); }
  function flushYT() { while (ytQueue.length) { try { ytQueue.shift()(); } catch (e) { console.error(e); } } }

  // ---------- Helpers ----------
  function parseVideoId(input) {
    if (!input) return null;
    const s = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
    try {
      const u = new URL(s);
      if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[2];
    } catch {}
    const m = s.match(/([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function showBanner(text, kind) {
    const b = $('#banner');
    if (!text) { b.classList.add('hidden'); return; }
    b.textContent = text;
    b.className = 'banner ' + (kind || 'info');
  }

  function setStatus() {
    const el = $('#status');
    if (!videoId) { el.textContent = ''; return; }
    el.textContent = isHost ? '● Вы ведущий' : '● Смотрите вместе';
    el.className = 'status ' + (isHost ? 'host' : 'guest');
  }

  function updateControls() {
    $('#player-wrap').classList.toggle('hidden', !videoId);
    $('#idle').classList.toggle('hidden', !!videoId);
    $('#stop-btn').classList.toggle('hidden', !isHost || !videoId);
    // Followers can't scrub/pause — lock pointer events over the player.
    $('#follower-lock').classList.toggle('hidden', isHost || !videoId);
    setStatus();
  }

  // ---------- Broadcast protocol ----------
  function broadcast(event, data, open) {
    sdk.broadcast(event, data || {}, open ? { open: true } : undefined)
      .catch(e => console.warn('[YTW] broadcast failed', event, e.message));
  }

  sdk.on('broadcast', ({ event, data, fromUserId }) => {
    if (event === 'start') return onRemoteStart(data, fromUserId);
    if (event === 'sync') return onRemoteSync(data);
    if (event === 'stop') return teardown(false);
    if (event === 'request-state') {
      // Only the host answers, with the live position so the newcomer syncs.
      if (isHost && playerReady) {
        broadcast('start', { videoId, hostUserId: me, time: player.getCurrentTime(), playing: isPlaying(), ts: Date.now() });
      }
    }
  });

  function isPlaying() {
    return player && player.getPlayerState && player.getPlayerState() === window.YT.PlayerState.PLAYING;
  }

  // ---------- Voice-channel presence tile (host only) ----------
  // The host publishes a tile into the voice channel so EVERY member sees that a
  // watch party is running and can control it — even before opening the player.
  function thumbUrl(vid) { return 'https://img.youtube.com/vi/' + vid + '/hqdefault.jpg'; }

  function presenceControls() {
    return [
      { id: 'play-pause', kind: 'button', label: isPlaying() ? '⏸' : '▶', tooltip: 'Пауза / Воспроизведение', style: 'primary' },
      { id: 'stop', kind: 'button', label: '⏹', tooltip: 'Завершить просмотр', style: '' },
    ];
  }

  async function fetchTitle(vid) {
    try {
      const r = await sdk.fetch('https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=' + vid, { responseType: 'json' });
      return (r && r.data && r.data.title) || '';
    } catch { return ''; }
  }

  async function createWatchPresence(vid) {
    if (presence) { try { await presence.setBackground({ type: 'image', url: thumbUrl(vid) }); } catch {} return; }
    try {
      presence = await sdk.voicePresence.create({ displayName: 'Совместный просмотр', avatar: thumbUrl(vid) });
      presence.on('control', onPresenceControl);
      await presence.setAccentColor('#ff3b30');
      await presence.setBackground({ type: 'image', url: thumbUrl(vid) });
      await presence.setControls(presenceControls());
      videoTitle = await fetchTitle(vid);
      if (videoTitle) await presence.setSubtitle(videoTitle);
    } catch (e) {
      console.warn('[YTW] presence create failed', e.message);
      presence = null;
    }
  }

  async function destroyWatchPresence() {
    if (!presence) return;
    const p = presence; presence = null;
    try { await p.destroy(); } catch {}
  }

  function refreshPresenceControls() {
    if (presence) presence.setControls(presenceControls()).catch(() => {});
  }

  // Any member can tap the tile controls; only the host (tile owner) receives them.
  function onPresenceControl(payload) {
    if (!isHost || !playerReady) return;
    if (payload.controlId === 'play-pause') {
      if (isPlaying()) player.pauseVideo(); else player.playVideo();
    } else if (payload.controlId === 'stop') {
      teardown(true);
    }
  }

  // ---------- Host actions ----------
  function startSession(vid) {
    isHost = true;
    hostUserId = me;
    videoId = vid;
    ensurePlayer(() => {
      player.loadVideoById(vid);
      player.playVideo();
    });
    updateControls();
    showBanner(null);
    broadcast('start', { videoId: vid, hostUserId: me, time: 0, playing: true, ts: Date.now() }, true);
    startHostSync();
    createWatchPresence(vid);
  }

  function startHostSync() {
    stopTimers();
    syncTimer = setInterval(() => {
      if (isHost && playerReady) {
        broadcast('sync', { time: player.getCurrentTime(), playing: isPlaying(), ts: Date.now() });
      }
    }, 3000);
  }

  // ---------- Follower actions ----------
  function onRemoteStart(data, fromUserId) {
    if (!data || !data.videoId) return;
    if (isHost && String(data.hostUserId) !== me) {
      // Someone else took over — step down to follower.
      isHost = false;
      stopTimers();
    }
    hostUserId = data.hostUserId || fromUserId;
    isHost = String(hostUserId) === me;
    videoId = data.videoId;
    pendingSync = { time: data.time || 0, playing: data.playing !== false, ts: data.ts || Date.now() };
    updateControls();
    showBanner(null);
    ensurePlayer(() => {
      player.loadVideoById({ videoId: data.videoId, startSeconds: targetTime(pendingSync) });
      applyPending();
    });
    if (isHost) { startHostSync(); createWatchPresence(data.videoId); }
    else { startFollowerDrift(); destroyWatchPresence(); }
  }

  function onRemoteSync(data) {
    if (isHost || !data) return;
    pendingSync = { time: data.time || 0, playing: data.playing !== false, ts: data.ts || Date.now() };
    if (playerReady) applyPending();
  }

  function targetTime(s) {
    return (s.time || 0) + (s.playing ? (Date.now() - s.ts) / 1000 : 0);
  }

  function applyPending() {
    if (!pendingSync || !playerReady) return;
    const s = pendingSync;
    const want = targetTime(s);
    const cur = player.getCurrentTime() || 0;
    if (Math.abs(cur - want) > 1.5) {
      suppressUntil = Date.now() + 800;
      player.seekTo(want, true);
    }
    const playing = isPlaying();
    if (s.playing && !playing) { suppressUntil = Date.now() + 800; player.playVideo(); }
    else if (!s.playing && playing) { suppressUntil = Date.now() + 800; player.pauseVideo(); }
  }

  function startFollowerDrift() {
    stopTimers();
    driftTimer = setInterval(() => { if (!isHost && playerReady) applyPending(); }, 4000);
  }

  // ---------- Player lifecycle ----------
  function ensurePlayer(cb) {
    whenYT(() => {
      if (player) { playerReady ? cb() : (pendingReadyCb = cb); return; }
      player = new window.YT.Player('yt-player', {
        width: '100%', height: '100%',
        videoId: videoId || undefined,
        playerVars: { autoplay: 1, controls: isHost ? 1 : 0, disablekb: isHost ? 0 : 1, rel: 0, modestbranding: 1, playsinline: 1, origin: location.origin },
        events: {
          onReady: () => { playerReady = true; if (pendingReadyCb) { const f = pendingReadyCb; pendingReadyCb = null; f(); } else cb(); },
          onStateChange: onPlayerStateChange,
          onError: (e) => showBanner('Не удалось воспроизвести видео (код ' + e.data + ')', 'error'),
        },
      });
    });
  }
  let pendingReadyCb = null;

  function onPlayerStateChange(e) {
    // Only the host drives the shared state.
    if (!isHost || !playerReady) return;
    if (Date.now() < suppressUntil) return;
    const st = e.data;
    if (st === window.YT.PlayerState.PLAYING || st === window.YT.PlayerState.PAUSED || st === window.YT.PlayerState.ENDED) {
      broadcast('sync', {
        time: player.getCurrentTime(),
        playing: st === window.YT.PlayerState.PLAYING,
        ts: Date.now(),
      });
      refreshPresenceControls();
    }
  }

  function stopTimers() {
    if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
    if (driftTimer) { clearInterval(driftTimer); driftTimer = null; }
  }

  function teardown(broadcastStop) {
    if (broadcastStop) broadcast('stop', {});
    stopTimers();
    destroyWatchPresence();
    const wasHost = isHost;
    isHost = false; hostUserId = null; videoId = null; pendingSync = null;
    if (player && player.stopVideo) { try { player.stopVideo(); } catch {} }
    updateControls();
    showBanner(wasHost ? 'Просмотр завершён.' : 'Ведущий завершил просмотр.', 'info');
  }

  // ---------- UI wiring ----------
  $('#start-btn').addEventListener('click', () => {
    if (!init.voiceChannelId) { showBanner('Зайди в голосовой канал, чтобы смотреть вместе.', 'warn'); return; }
    const vid = parseVideoId($('#url').value);
    if (!vid) { showBanner('Не похоже на ссылку YouTube.', 'error'); return; }
    startSession(vid);
  });
  $('#url').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#start-btn').click(); });
  $('#stop-btn').addEventListener('click', () => teardown(true));

  if (!init.voiceChannelId) {
    showBanner('Зайди в голосовой канал Zvon, чтобы смотреть видео вместе с участниками.', 'warn');
  }

  // We may have been auto-opened because a session is already running — ask the
  // host for the current state so we can join mid-stream.
  setTimeout(() => { if (!videoId) broadcast('request-state', {}); }, 600);

  updateControls();
})();
