// Yandex Music mini-app for Zvon — reference implementation of the Zvon Mini-App SDK.
// All Yandex API calls go through zvon.fetch (server proxy, bypasses CORS).
// Audio is played via an <audio> element, captured with captureStream() and
// published into the user's voice channel via zvon.publishAudioTrack().

(async function () {
  // The mini-app developer registers an OAuth client at https://oauth.yandex.ru/
  // with redirect URI = the absolute URL of oauth-callback.html in this folder.
  // The client_id is public; replace with yours.
  const YANDEX_CLIENT_ID = window.YM_CLIENT_ID || 'f714685f466146d983e91542ee0267d3';

  const YA_API = 'https://api.music.yandex.net';
  const HEADERS_BASE = {
    'X-Yandex-Music-Client': 'Android/14562',
    'User-Agent': 'YandexMusic/2024.03.1 (ru.yandex.music; build:14562; Android 13; Pixel 6)',
  };

  await new Promise(r => window.zvon ? r() : window.addEventListener('zvon-sdk-ready', r, { once: true }));
  const sdk = window.zvon;

  const $ = (sel) => document.querySelector(sel);
  const main = $('#main');
  const account = $('#account');
  const player = $('#player');

  let init;
  try { init = await sdk.init(); }
  catch (e) { return showFatal('Не удалось инициализировать SDK: ' + e.message); }

  let token = await sdk.storage.get('access_token').catch(() => null);
  let ymAccount = await sdk.storage.get('account').catch(() => null);

  // Player state
  let queue = [];
  let currentIndex = -1;
  let shuffleMode = false;
  let _libraryCache = null;
  const _libraryExpanded = new Set();

  // "Моя волна" — infinite personalized radio (Yandex rotor station).
  let waveMode = false;
  let waveStation = 'user:onyourwave';
  let waveBatchId = null;
  let waveLoading = false;

  // Станции-настроения для домашнего экрана My Vibe (rotor).
  // Объявлено здесь (до первого renderVibeScreen при старте), чтобы не попасть в TDZ.
  const VIBE_STATIONS = [
    { id: 'user:onyourwave',   title: 'Моя волна',   grad: 'linear-gradient(135deg,#ff2d8e,#8b3bff 55%,#2d6bff)' },
    { id: 'genre:rusrap',      title: 'Русский рэп', grad: 'linear-gradient(135deg,#13c2c2,#0a6e6e)' },
    { id: 'genre:pop',         title: 'Поп',         grad: 'linear-gradient(135deg,#ff6ec4,#7873f5)' },
    { id: 'genre:rock',        title: 'Рок',         grad: 'linear-gradient(135deg,#f7971e,#ffd200)' },
    { id: 'genre:electronics', title: 'Электроника', grad: 'linear-gradient(135deg,#43e97b,#38f9d7)' },
    { id: 'activity:party',    title: 'Вечеринка',   grad: 'linear-gradient(135deg,#fa709a,#fee140)' },
    { id: 'mood:energetic',    title: 'Энергия',     grad: 'linear-gradient(135deg,#4facfe,#00f2fe)' },
    { id: 'mood:calm',         title: 'Спокойствие', grad: 'linear-gradient(135deg,#a18cd1,#fbc2eb)' },
    { id: 'genre:indie',       title: 'Инди',        grad: 'linear-gradient(135deg,#30cfd0,#330867)' },
  ];

  // Voice channel presence (the mini-app's tile inside the user's voice channel).
  let presence = null;
  let progressTimer = null;

  // --- Audio element (recreated per track) ---
  // Chrome's audio.captureStream() returns the SAME MediaStream across src
  // changes, and the captured track often stops carrying audio after a src
  // swap. The reliable fix is to use a fresh <audio> per track and capture
  // its stream once — the track stays live for the duration of that blob.
  let audio = null;
  let _captureStream = null;
  let _userVolume = 0.8;
  function recreateAudio() {
    // Tear down old element if any.
    if (audio) {
      try { audio.pause(); } catch {}
      audio.src = '';
      try { audio.load(); } catch {}
    }
    if (_captureStream) {
      _captureStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
    }
    _captureStream = null;
    audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audio.volume = _userVolume;
    audio.addEventListener('ended', () => {
      if (waveMode) sendWaveFeedback('trackFinished', { trackId: queue[currentIndex]?.id, totalPlayedSeconds: Math.round(audio.duration || 0) });
      if (currentIndex < queue.length - 1) playIndex(currentIndex + 1); else stopPlayback();
    });
    audio.addEventListener('timeupdate', () => { updateLocalProgress(); pushPresenceProgress(); });
    audio.addEventListener('play',  () => { setPlayIcon(true);  updatePresenceControls(); });
    audio.addEventListener('pause', () => { setPlayIcon(false); updatePresenceControls(); });
  }
  function getCaptureTrack() {
    if (!audio || typeof audio.captureStream !== 'function') {
      console.error('[YM] audio.captureStream not supported / no audio element');
      return null;
    }
    if (!_captureStream) _captureStream = audio.captureStream();
    return _captureStream.getAudioTracks()[0] || null;
  }
  recreateAudio();

  // SVG icons for play/pause toggle.
  const ICON_PLAY = '<path d="M8 5v14l11-7z"/>';
  const ICON_PAUSE = '<path d="M6 4h4v16H6zm8 0h4v16h-4z"/>';
  function setPlayIcon(playing) {
    const el = $('#play-icon');
    if (el) el.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    const v = $('#vibe-play-icon');
    if (v) v.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
  }
  function setVolIcon(v) {
    const el = $('#vol-icon');
    if (!el) return;
    if (v === 0) el.innerHTML = '<path d="M3.63 3.63a1 1 0 0 0 0 1.41L7.29 8.7 7 9H3v6h4l5 5v-6.59l4.18 4.18c-.49.37-1.02.68-1.6.91-.36.15-.58.53-.58.92 0 .72.73 1.18 1.39.91.8-.33 1.55-.77 2.22-1.31l1.34 1.34a1 1 0 0 0 1.41-1.41L5.05 3.63c-.39-.39-1.02-.39-1.42 0zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-3.83-2.4-7.11-5.78-8.4-.59-.23-1.22.23-1.22.86v.19c0 .38.25.71.61.85C17.18 6.54 19 9.06 19 12zm-8.71-6.29l-.17.17L12 7.76V6.41c0-.89-1.08-1.33-1.71-.7zM16.5 12A4.5 4.5 0 0 0 14 7.97v1.79l2.48 2.48c.01-.08.02-.16.02-.24z"/>';
    else if (v < 0.5) el.innerHTML = '<path d="M7 9v6h4l5 5V4l-5 5H7z"/>';
    else el.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"/>';
  }

  // Persisted volume — restored from storage, saved on change.
  const savedVol = await sdk.storage.get('volume').catch(() => null);
  _userVolume = (typeof savedVol === 'number') ? Math.max(0, Math.min(1, savedVol)) : 0.8;
  audio.volume = _userVolume;
  $('#vol').value = String(Math.round(_userVolume * 100));
  setVolIcon(_userVolume);
  let _volSaveTimer = null;
  $('#vol').addEventListener('input', (e) => {
    _userVolume = Number(e.target.value) / 100;
    if (audio) audio.volume = _userVolume;
    setVolIcon(_userVolume);
    clearTimeout(_volSaveTimer);
    _volSaveTimer = setTimeout(() => sdk.storage.set('volume', _userVolume).catch(() => {}), 300);
  });

  $('#btn-play').addEventListener('click', () => { if (audio) audio.paused ? audio.play() : audio.pause(); });
  $('#btn-prev').addEventListener('click', () => { if (currentIndex > 0) playIndex(currentIndex - 1); });
  $('#btn-next').addEventListener('click', () => {
    if (waveMode) sendWaveFeedback('skip', { trackId: queue[currentIndex]?.id, totalPlayedSeconds: Math.round(audio?.currentTime || 0) });
    if (currentIndex < queue.length - 1) playIndex(currentIndex + 1);
  });
  $('#btn-stop').addEventListener('click', stopPlayback);
  $('#btn-shuffle').addEventListener('click', toggleShuffle);

  function toggleShuffle() {
    shuffleMode = !shuffleMode;
    const btn = $('#btn-shuffle');
    if (btn) btn.classList.toggle('active', shuffleMode);
    // When turning on, shuffle the queue (keeping current track in place).
    if (shuffleMode && queue.length > currentIndex + 2) {
      const head = queue.slice(0, currentIndex + 1);
      const tail = queue.slice(currentIndex + 1);
      for (let i = tail.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tail[i], tail[j]] = [tail[j], tail[i]];
      }
      queue = head.concat(tail);
      renderQueue();
      if ($('#queue-page-tracks')) renderQueuePageTracks();
    }
    updatePresenceControls();
  }

  // ---------- Лайки (синхронизация с реальной Я.Музыкой) ----------
  let likedTrackIds = new Set();

  async function loadLikedTrackIds() {
    if (!ymAccount?.uid || !token) return;
    try {
      const likes = await yaCall(`/users/${encodeURIComponent(ymAccount.uid)}/likes/tracks`);
      likedTrackIds = new Set((likes.result?.library?.tracks || []).map(t => String(t.id)));
      updateLikeButton();
    } catch (e) { console.warn('[YM] load likes failed:', e.message); }
  }

  async function yaPostForm(path, params) {
    const r = await sdk.fetch(YA_API + path, {
      method: 'POST',
      headers: { ...HEADERS_BASE, Authorization: 'OAuth ' + token, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
      responseType: 'json',
    });
    if (r.status >= 400) throw new Error('Yandex API ' + r.status);
    return r.data;
  }

  function updateLikeButton() {
    const btn = $('#btn-like');
    if (!btn) return;
    const track = queue[currentIndex];
    const liked = !!(track?.id && likedTrackIds.has(String(track.id)));
    btn.classList.toggle('liked', liked);
    btn.title = liked ? 'Убрать из «Мне нравится»' : 'Добавить в «Мне нравится»';
    // Закрашенное сердце для активного состояния.
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', liked ? 'currentColor' : 'none');
  }

  function isLiked(trackId) { return !!(trackId && likedTrackIds.has(String(trackId))); }
  function toggleLike() { return toggleLikeFor(queue[currentIndex]?.id); }

  async function toggleLikeFor(trackId) {
    if (!trackId) return;
    if (!ymAccount?.uid || !token) { console.warn('[YM] like: не авторизован'); return; }
    const id = String(trackId);
    const wasLiked = likedTrackIds.has(id);
    // Оптимистично обновляем UI.
    if (wasLiked) likedTrackIds.delete(id); else likedTrackIds.add(id);
    updateLikeButton();
    try {
      const action = wasLiked ? 'remove' : 'add-multiple';
      await yaPostForm(`/users/${encodeURIComponent(ymAccount.uid)}/likes/tracks/${action}`, { 'track-ids': id });
    } catch (e) {
      // Откат при ошибке.
      if (wasLiked) likedTrackIds.add(id); else likedTrackIds.delete(id);
      updateLikeButton();
      console.warn('[YM] like toggle failed:', e.message);
    }
  }

  $('#btn-like')?.addEventListener('click', toggleLike);

  // ---------- Полноэкранный режим плеера ----------
  function toggleFullscreen() {
    const expanded = player.classList.toggle('expanded');
    document.body.classList.toggle('player-fs', expanded);
  }
  $('#btn-fullscreen')?.addEventListener('click', toggleFullscreen);
  // Тап по обложке/названию разворачивает плеер — на телефоне кнопки «на весь
  // экран» в свёрнутом виде нет, места на неё не хватает.
  ['#player-cover', '.player-info'].forEach(sel => {
    $(sel)?.addEventListener('click', (e) => {
      if (e.target.closest('#player-bar')) return;   // клик по прогрессу — это перемотка
      if (!player.classList.contains('expanded')) toggleFullscreen();
    });
  });
  $('#btn-more')?.addEventListener('click', () => {
    const track = queue[currentIndex];
    if (track) openTrackMenu(track, { inQueue: true, queueIndex: currentIndex });
  });

  // Click on player progress bar to seek.
  $('#player-bar')?.addEventListener('click', (e) => {
    if (!audio || !isFinite(audio.duration) || audio.duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = Math.max(0, Math.min(audio.duration, pct * audio.duration));
  });

  sdk.on('voiceChannelChanged', async (p) => {
    if (!p.channelId && presence) {
      try { await presence.destroy(); } catch {}
      presence = null;
      renderVoiceJoinButton();
    }
  });

  renderAccount();
  setupSidebar();
  if (!token) renderConnectScreen();
  else renderVibeScreen();

  // ---------- UI screens ----------

  function showFatal(text) {
    main.innerHTML = `<div class="banner error">${escape(text)}</div>`;
  }

  function renderAccount() {
    if (token && ymAccount) {
      account.innerHTML = `<span class="login">${escape(ymAccount.login || '')}</span>` +
        (ymAccount.hasPlus ? '<span class="plus-badge">PLUS</span>' : '') +
        '<button id="logout">Выйти</button>';
      $('#logout').addEventListener('click', async () => {
        await sdk.storage.delete('access_token');
        await sdk.storage.delete('account');
        token = null; ymAccount = null;
        _libraryCache = null;
        renderAccount();
        renderConnectScreen();
      });
    } else {
      account.innerHTML = '';
    }
  }

  // ---------- Sidebar (навигация как в оригинале) ----------
  function setSidebarActive(id) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.id === id));
  }

  function setupSidebar() {
    const go = {
      'nav-vibe':       () => renderVibeScreen(),
      'nav-search':     () => { renderSearchScreen(); setTimeout(() => $('#q')?.focus(), 0); },
      'nav-collection': () => { renderSearchScreen(); setTimeout(() => $('#library')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0); },
      'nav-foryou':     () => renderStubScreen('🎧', 'For you and Trends', 'Персональные подборки и тренды доступны в полном приложении Яндекс Музыки. Здесь пользуйся «My Vibe» и поиском.'),
      'nav-concerts':   () => renderStubScreen('🎤', 'Концерты', 'Раздел концертов недоступен в мини-аппе.'),
      'nav-books':      () => renderStubScreen('📚', 'Книги и подкасты', 'Раздел книг и подкастов недоступен в мини-аппе.'),
      'nav-kids':       () => renderStubScreen('🧸', 'Детям', 'Детский раздел недоступен в мини-аппе.'),
    };
    Object.entries(go).forEach(([id, fn]) => {
      const elBtn = document.getElementById(id);
      if (!elBtn) return;
      elBtn.addEventListener('click', () => {
        if (!token) { renderConnectScreen(); return; }
        setSidebarActive(id);
        fn();
      });
    });
    const toggleSidebar = () => document.getElementById('app')?.classList.toggle('sidebar-collapsed');
    // Логотип — основная мишень: в свёрнутом сайдбаре стрелка скрыта, и иначе
    // развернуть его обратно было бы почти нечем.
    document.querySelector('.side-logo')?.addEventListener('click', toggleSidebar);
    document.getElementById('side-collapse')?.addEventListener('click', (e) => {
      e.stopPropagation();   // иначе клик дойдёт до .side-logo и тоггл сработает дважды
      toggleSidebar();
    });
  }

  function renderSidebarPlaylists() {
    const host = document.getElementById('side-playlists');
    if (!host || !_libraryCache) return;
    const items = (_libraryCache.ownPlaylists || []).slice(0, 6);
    host.innerHTML = '';
    items.forEach(p => {
      const cover = p.cover ? `https://${p.cover.replace('%%', '100x100')}` : '';
      const row = document.createElement('div');
      row.className = 'side-pl';
      row.innerHTML = `
        <div class="side-pl-cover" style="${cover ? `background-image:url('${cover}')` : `background:linear-gradient(135deg, ${p.accent || '#3a3a44'}, #1a1a22)`}"></div>
        <div class="side-pl-meta"><div class="t">${escape(p.title)}</div><div class="s">Плейлист</div></div>`;
      row.addEventListener('click', () => openItemPage(p));
      host.appendChild(row);
    });
  }

  // Заглушка для разделов, которых нет в мини-аппе (но кнопка должна реагировать).
  function renderStubScreen(emoji, title, note) {
    $('#search-bar-host').innerHTML = '';
    main.innerHTML = `<div class="stub"><div class="stub-emoji">${emoji}</div><h2>${escape(title)}</h2><p>${escape(note)}</p></div>`;
  }

  // ---------- My Vibe (домашний экран как в оригинале) ----------
  // Тянем РЕАЛЬНЫЙ список станций из rotor (валидные id + названия + цвета иконок).
  // Первой всегда «Моя волна». При ошибке — откат на curated VIBE_STATIONS.
  async function loadStations() {
    const out = [{ id: 'user:onyourwave', title: 'Моя волна', grad: 'linear-gradient(135deg,#ff2d8e,#8b3bff 55%,#2d6bff)' }];
    try {
      const r = await yaCall('/rotor/stations/list?language=ru');
      (r.result || []).forEach(e => {
        const st = e.station || e;
        if (!st?.id?.type || !st?.id?.tag) return;
        const id = `${st.id.type}:${st.id.tag}`;
        if (id === 'user:onyourwave') return;
        out.push({
          id, title: st.name || id,
          color: st.icon?.backgroundColor || null,
          icon: st.icon?.imageUrl || null,
          image: st.fullImageUrl || st.mtsFullImageUrl || null,
        });
      });
    } catch (e) {
      console.warn('[YM] stations list failed:', e.message);
      if (out.length === 1) VIBE_STATIONS.slice(1).forEach(s => out.push(s));
    }
    return out;
  }

  // Подписи к станциям (§18). Rotor отдаёт только название, поэтому короткий
  // разъясняющий текст — свой, по тегу станции; для незнакомых тегов не
  // выдумываем ничего и оставляем карточку без подписи.
  const STATION_SUBTITLES = {
    'user:onyourwave':   'Бесконечный поток, собранный под тебя',
    'personal:collection': 'То, что ты уже отметил как любимое',
    'mood:energetic':    'Разогнаться и не сбавлять',
    'mood:calm':         'Тише, медленнее, спокойнее',
    'mood:happy':        'Когда всё идёт как надо',
    'mood:sad':          'Для вечеров, когда хочется грустить',
    'activity:party':    'Громко и до утра',
    'activity:workout':  'Темп, который тянет вперёд',
    'activity:driving':  'В дорогу — длинную и ночную',
    'activity:study':    'Фоном, чтобы не отвлекало',
    'activity:relax':    'Выдохнуть и ничего не делать',
    'genre:pop':         'Главное на слуху прямо сейчас',
    'genre:rock':        'Гитары, которые никуда не делись',
    'genre:rusrap':      'Русский рэп — от классики до новых имён',
    'genre:electronics': 'Электроника для длинной ночи',
    'genre:indie':       'Небольшие имена с большим звуком',
    'genre:jazz':        'Живой звук и импровизация',
    'genre:classical':   'Академическая музыка на любой час',
  };

  function makeWaveTile(s) {
    const tile = document.createElement('button');
    tile.className = 'wave-tile' + (s.id === waveStation && waveMode ? ' active' : '');
    tile.dataset.station = s.id;

    // Фон: крупная картинка станции, иначе градиент из её фирменного цвета.
    if (s.image) {
      tile.style.backgroundImage = `url('https://${s.image.replace('%%', '400x400')}')`;
    } else if (s.grad) {
      tile.style.background = s.grad;
    } else if (s.color) {
      tile.style.background = `linear-gradient(150deg, ${s.color} 0%, ${s.color} 40%, rgba(0,0,0,.65) 100%)`;
    }

    const sub = STATION_SUBTITLES[s.id] || '';
    const icon = (!s.image && s.icon) ? `https://${s.icon.replace('%%', '100x100')}` : '';
    tile.innerHTML = `
      <span class="wave-tile-eq"><span></span><span></span><span></span></span>
      ${icon ? `<img class="wave-tile-icon" src="${icon}" alt="" />` : ''}
      <span class="wave-tile-text">
        <span class="wave-tile-title">${escape(s.title)}</span>
        ${sub ? `<span class="wave-tile-sub">${escape(sub)}</span>` : ''}
      </span>
      <span class="wave-tile-play"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>`;

    tile.addEventListener('click', () => {
      document.querySelectorAll('.wave-tile').forEach(n => n.classList.remove('active'));
      tile.classList.add('active');
      startWave(s.id);
    });
    return tile;
  }

  function renderVibeScreen() {
    setSidebarActive('nav-vibe');
    backTarget = renderVibeScreen;
    $('#search-bar-host').innerHTML = '';
    if (!token) { renderConnectScreen(); return; }
    main.innerHTML = `
      <div id="voice-banner"></div>
      <div class="vibe-screen">
        <div class="vibe-hero">
          <div class="vibe-bg"></div>
          <div class="vibe-hero-inner">
            <div class="vibe-eyebrow">Моя волна</div>
            <div class="vibe-title" id="vibe-title">My Vibe</div>
            <div class="vibe-cover" id="vibe-cover"></div>
            <div class="vibe-track" id="vibe-track" style="display:none"></div>
            <div class="vibe-controls">
              <button id="vibe-prev" class="vibe-ctrl" title="Предыдущий"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
              <button id="vibe-play" class="vibe-play" title="Слушать"><svg id="vibe-play-icon" width="32" height="32" viewBox="0 0 24 24" fill="currentColor">${ICON_PLAY}</svg></button>
              <button id="vibe-next" class="vibe-ctrl" title="Следующий"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg></button>
            </div>
          </div>
        </div>

        <section class="wave-section">
          <div class="library-section-title">
            Сегодня для тебя
            <button class="library-show-more" id="wave-show-all" hidden>Все</button>
          </div>
          <div class="wave-rail" id="wave-rail"></div>
        </section>

        <article class="ai-insight" id="ai-insight" hidden></article>
      </div>`;
    renderVoiceJoinButton();

    renderWaveRail();
    renderAiInsight(queue[currentIndex]);

    $('#vibe-play').addEventListener('click', () => {
      if (audio && audio.src && currentIndex >= 0) { audio.paused ? audio.play() : audio.pause(); }
      else startWave('user:onyourwave');
    });
    $('#vibe-prev').addEventListener('click', () => { if (currentIndex > 0) playIndex(currentIndex - 1); });
    $('#vibe-next').addEventListener('click', () => { if (currentIndex < queue.length - 1) playIndex(currentIndex + 1); });

    updateVibeNowPlaying(queue[currentIndex]);
    setPlayIcon(!!(audio && !audio.paused && audio.src));

    // Подтягиваем плейлисты в сайдбар (фоном), если ещё не загружены.
    if (ymAccount?.uid) {
      if (_libraryCache) renderSidebarPlaylists();
      else loadLibrary(ymAccount.uid).then(c => { _libraryCache = c; renderSidebarPlaylists(); }).catch(() => {});
      loadLikedTrackIds();
    }
  }

  // §18: на первом экране — 5–6 категорий, остальные прячутся за «Все».
  const WAVE_RAIL_VISIBLE = 6;

  function renderWaveRail() {
    const rail = $('#wave-rail');
    const showAll = $('#wave-show-all');
    if (!rail) return;
    rail.innerHTML = '<div class="skeleton"></div>'.repeat(3);

    const fill = (stations) => {
      if (!rail.isConnected) return;
      let expanded = false;
      const paint = () => {
        rail.innerHTML = '';
        (expanded ? stations : stations.slice(0, WAVE_RAIL_VISIBLE))
          .forEach(s => rail.appendChild(makeWaveTile(s)));
      };
      paint();
      if (showAll && stations.length > WAVE_RAIL_VISIBLE) {
        showAll.hidden = false;
        showAll.onclick = () => {
          expanded = !expanded;
          showAll.textContent = expanded ? 'Свернуть' : 'Все';
          paint();
          if (!expanded) rail.scrollTo({ left: 0, behavior: 'smooth' });
        };
      }
    };
    loadStations().then(fill).catch(() => fill(VIBE_STATIONS));
  }

  // ---------- AI Insight (§32) ----------
  // Редакционная карточка о текущем исполнителе. Текст — реальное описание с
  // Я.Музыки; если его нет, карточка просто не показывается: придумывать
  // «интересный факт» за сервис мы не станем.
  const artistBriefCache = new Map();
  let aiInsightToken = 0;

  async function loadArtistBrief(artistId) {
    const r = await yaCall(`/artists/${encodeURIComponent(artistId)}/brief-info`);
    const artist = r?.result?.artist;
    if (!artist) return null;
    return {
      name: artist.name || '',
      text: artist.description?.text?.trim() || '',
      listeners: r?.result?.stats?.lastMonthListeners,
      genres: artist.genres || [],
      albums: (r?.result?.albums || []).length,
      tracks: artist.counts?.tracks,
    };
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  async function renderAiInsight(track) {
    const card = $('#ai-insight');
    if (!card) return;
    const artistId = track?.artistIds?.[0];
    if (!artistId) { card.hidden = true; return; }

    const my = ++aiInsightToken;
    card.hidden = false;
    card.classList.remove('expanded');
    card.innerHTML = '<div class="skeleton ai-insight-skeleton"></div>';

    let brief = artistBriefCache.get(artistId);
    if (brief === undefined) {
      try { brief = await loadArtistBrief(artistId); } catch { brief = null; }
      artistBriefCache.set(artistId, brief);
    }
    if (my !== aiInsightToken || !card.isConnected) return;
    if (!brief) { card.hidden = true; return; }

    // Описание есть далеко не у каждого исполнителя. Раньше карточка в таком
    // случае просто пряталась — и её почти никто не видел. Теперь без описания
    // показываем то, что сервис знает точно: слушатели, релизы, жанры.
    // Ничего не сочиняем, только меняем заголовок на честный.
    const facts = [];
    if (brief.listeners) facts.push(fmtListeners(brief.listeners));
    if (brief.albums) facts.push(`${brief.albums} ${plural(brief.albums, 'альбом', 'альбома', 'альбомов')}`);
    if (brief.tracks) facts.push(`${brief.tracks} ${plural(brief.tracks, 'трек', 'трека', 'треков')}`);
    if (brief.genres.length) facts.push(brief.genres.slice(0, 3).join(', '));

    const body = brief.text || facts.join(' · ');
    if (!body) { card.hidden = true; return; }

    card.innerHTML = `
      <div class="ai-insight-head"><span class="ai-mark">✦</span>${brief.text ? 'Интересный факт' : 'Об исполнителе'}</div>
      ${brief.name ? `<div class="ai-insight-who">${escape(brief.name)}</div>` : ''}
      <p class="ai-insight-body">${escape(body)}</p>
      <button class="ai-insight-cta">Подробнее →</button>`;

    // «Подробнее» ведёт на страницу исполнителя — там тот же текст целиком
    // плюс популярные треки, альбомы и похожие.
    card.querySelector('.ai-insight-cta')
      .addEventListener('click', () => openArtistPage(artistId, brief.name));
  }

  function fmtListeners(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' млн слушателей в месяц';
    if (n >= 1e3) return Math.round(n / 1e3) + ' тыс. слушателей в месяц';
    return n + ' слушателей в месяц';
  }

  function updateVibeNowPlaying(track) {
    const t = $('#vibe-title'); const pill = $('#vibe-track');
    const coverEl = $('#vibe-cover'); const bgEl = document.querySelector('.vibe-bg');
    if (!t) return;
    if (track) {
      t.textContent = (track.artists && track.artists.length) ? track.artists.join(', ') : (track.title || 'My Vibe');
      if (pill) { pill.textContent = track.title || ''; pill.style.display = track.title ? '' : 'none'; }
      const cover = track.coverUri ? `https://${track.coverUri.replace('%%', '400x400')}` : '';
      if (coverEl) { coverEl.style.backgroundImage = cover ? `url('${cover}')` : ''; coverEl.style.display = cover ? '' : 'none'; }
      // «Аура» позади — размытая обложка трека (как в оригинале My Vibe).
      if (bgEl) bgEl.style.backgroundImage = cover ? `url('${cover}')` : '';
      renderAiInsight(track);
    } else {
      t.textContent = 'My Vibe';
      if (pill) pill.style.display = 'none';
      if (coverEl) { coverEl.style.backgroundImage = ''; coverEl.style.display = 'none'; }
      if (bgEl) bgEl.style.backgroundImage = '';
      renderAiInsight(null);
    }
  }

  function renderConnectScreen() {
    $('#search-bar-host').innerHTML = '';
    main.innerHTML = `
      <div class="connect-screen">
        <h2>Подключи аккаунт Яндекс Музыки</h2>
        <p>Чтобы слушать музыку вместе с друзьями в голосовом канале, нужен токен Яндекса с доступом к Музыке.</p>
        <button class="connect-btn" id="connect-btn">Войти через OAuth (для базового профиля)</button>
        <details open style="margin-top:14px;max-width:520px;text-align:left">
          <summary style="cursor:pointer;color:#ffcc00;font-size:13px;font-weight:700">⚡ Рекомендуемый способ — вставить токен вручную</summary>
          <p style="font-size:12px;color:#aaa;line-height:1.5;margin-top:10px">
            OAuth-приложения, регистрируемые публично, <strong>не получают scope <code>music:content</code></strong> —
            Яндекс отдаёт только 30-секундные превью. Но если ты уже залогинен в Яндекс Музыку с подпиской Plus,
            ты можешь забрать готовый токен прямо из браузера.
          </p>
          <ol style="font-size:12px;color:#ccc;line-height:1.7;padding-left:18px">
            <li>Открой <a href="https://music.yandex.ru" target="_blank" style="color:#ffcc00">music.yandex.ru</a> и убедись, что залогинен (тот аккаунт с Plus).</li>
            <li>Открой DevTools (F12) → вкладка <strong>Network</strong>.</li>
            <li>Обнови страницу (F5). В фильтре набери <code>api.music.yandex.net</code>.</li>
            <li>Кликни любой запрос → раздел <strong>Request Headers</strong> → найди <code>Authorization: OAuth y0_…</code> (или <code>Authorization: OAuth AQA…</code>).</li>
            <li>Скопируй ТОЛЬКО токен (без слова <code>OAuth</code>) и вставь ниже.</li>
          </ol>
          <input id="manual-token" type="password" placeholder="y0_AgAAA…" style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:white;font-size:13px;font-family:monospace;outline:none;margin-top:8px" />
          <button class="connect-btn" id="manual-token-btn" style="margin-top:10px">Сохранить токен</button>
        </details>
      </div>`;
    $('#connect-btn').addEventListener('click', connectYandex);
    $('#manual-token-btn').addEventListener('click', connectManual);
    $('#manual-token').addEventListener('keydown', (e) => { if (e.key === 'Enter') connectManual(); });
  }

  async function connectManual() {
    const inp = $('#manual-token');
    const raw = (inp.value || '').trim().replace(/^OAuth\s+/i, '');
    if (!raw) { inp.focus(); return; }
    token = raw;
    try {
      const acc = await yaCall('/account/status');
      const accInfo = {
        login: acc.result?.account?.login || '(токен)',
        uid: String(acc.result?.account?.uid || ''),
        hasPlus: !!(acc.result?.plus?.hasPlus || acc.result?.permissions?.values?.includes('landing-play')),
      };
      await sdk.storage.set('access_token', token);
      await sdk.storage.set('account', accInfo);
      ymAccount = accInfo;
      loadLikedTrackIds();
      renderAccount();
      renderVibeScreen();
    } catch (e) {
      token = null;
      alert('Токен не работает: ' + e.message);
    }
  }

  async function connectYandex() {
    const redirectUri = new URL('./oauth-callback.html', window.location.href).toString();
    const url = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${encodeURIComponent(YANDEX_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&force_confirm=yes`;
    console.log('[YM OAuth] redirect_uri =', redirectUri);
    console.log('[YM OAuth] open URL    =', url);
    try {
      const r = await sdk.oauthPopup(url, { width: 600, height: 720 });
      console.log('[YM OAuth] popup returned:', r);

      // Implicit flow returns token in hash. Errors may come back in search.
      const hashParams = new URLSearchParams((r.hash || '').replace(/^#/, ''));
      const queryParams = new URLSearchParams((r.search || '').replace(/^\?/, ''));

      const oauthError = hashParams.get('error') || queryParams.get('error');
      const errorDesc = hashParams.get('error_description') || queryParams.get('error_description');
      if (oauthError) throw new Error(`Яндекс: ${oauthError}${errorDesc ? ' — ' + decodeURIComponent(errorDesc.replace(/\+/g, ' ')) : ''}`);

      const accessToken = hashParams.get('access_token');
      if (!accessToken) {
        throw new Error(
          'access_token не пришёл. Вероятная причина: в настройках OAuth-приложения Яндекса не включён Implicit Grant. ' +
          'Полный URL возврата: ' + (r.href || '(пусто)')
        );
      }

      await sdk.storage.set('access_token', accessToken);
      token = accessToken;
      const acc = await yaCall('/account/status');
      const accInfo = {
        login: acc.result?.account?.login,
        uid: String(acc.result?.account?.uid || ''),
        hasPlus: !!(acc.result?.plus?.hasPlus || acc.result?.permissions?.values?.includes('landing-play')),
      };
      await sdk.storage.set('account', accInfo);
      ymAccount = accInfo;
      loadLikedTrackIds();
      renderAccount();
      renderVibeScreen();
    } catch (e) {
      console.error('[YM OAuth]', e);
      alert('Ошибка авторизации: ' + e.message);
    }
  }

  function renderSearchScreen() {
    backTarget = renderSearchScreen;
    // Search box lives OUTSIDE the scrollable .main so it stays put.
    const host = $('#search-bar-host');
    host.innerHTML = `
      <div class="search-box">
        <input id="q" placeholder="Поиск или вставь ссылку на трек / альбом / плейлист…" autocomplete="off" />
        <button id="search-btn">Найти</button>
        <button id="queue-btn" class="queue-btn" title="Очередь воспроизведения">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>
          <span>Очередь</span>
          <span id="queue-badge" class="queue-badge"></span>
        </button>
      </div>
    `;
    main.innerHTML = `
      <div id="voice-banner"></div>
      ${ymAccount?.uid ? `
      <button id="wave-card" class="wave-card" type="button">
        <div class="wave-card-glow"></div>
        <div class="wave-card-eq"><span></span><span></span><span></span><span></span><span></span></div>
        <div class="wave-card-text">
          <div class="wave-card-title">Моя волна</div>
          <div class="wave-card-sub">Бесконечный поток музыки для тебя</div>
        </div>
        <div class="wave-card-play">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </button>` : ''}
      <div id="results-section" hidden>
        <div class="section-title">Результаты</div>
        <div id="results" class="track-list"></div>
      </div>
      <div class="section-title">Моя медиатека <span id="library-status" style="color:#666;font-weight:normal"></span></div>
      <div id="library" class="library-grid"></div>
    `;
    renderVoiceJoinButton();
    renderLibrary();
    updateQueueBadge();
    $('#wave-card')?.addEventListener('click', startWave);
    const q = $('#q');
    q.focus();
    let searchTimer = null;
    q.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => doSearch(q.value), 400); });
    $('#search-btn').addEventListener('click', () => doSearch(q.value));
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(q.value); });
    $('#queue-btn').addEventListener('click', openQueuePage);
  }

  function updateQueueBadge() {
    const b = $('#queue-badge');
    if (!b) return;
    if (queue.length) { b.textContent = String(queue.length); b.style.display = ''; }
    else b.style.display = 'none';
  }

  // ---------- My Library ----------

  async function renderLibrary() {
    const wrap = $('#library');
    const status = $('#library-status');
    if (!wrap) return;
    if (!ymAccount?.uid) {
      wrap.innerHTML = '<div class="empty">Авторизуйся, чтобы увидеть свои плейлисты.</div>';
      return;
    }
    if (!_libraryCache) {
      wrap.innerHTML = '<div class="loading">Загружаю медиатеку…</div>';
      try {
        _libraryCache = await loadLibrary(ymAccount.uid);
      } catch (e) {
        wrap.innerHTML = `<div class="banner error">Не удалось загрузить медиатеку: ${escape(e.message)}</div>`;
        return;
      }
    }
    const { ownPlaylists, likedPlaylists, likedAlbums } = _libraryCache;
    const total = ownPlaylists.length + likedPlaylists.length + likedAlbums.length;
    if (status) status.textContent = total ? `· ${total}` : '';
    if (!total) { wrap.innerHTML = '<div class="empty">У тебя пока пустая медиатека.</div>'; return; }

    wrap.innerHTML = '';
    const renderSection = (title, items, sectionKey) => {
      if (!items.length) return;
      const head = document.createElement('div');
      head.className = 'library-section-title';
      head.innerHTML = `<span>${escape(title)}</span>`;
      wrap.appendChild(head);

      const grid = document.createElement('div');
      grid.className = 'library-row';
      wrap.appendChild(grid);

      const SHOW_LIMIT = 4;
      const expanded = _libraryExpanded.has(sectionKey);
      const visible = expanded ? items : items.slice(0, SHOW_LIMIT);
      visible.forEach(p => grid.appendChild(renderLibraryCard(p)));

      if (items.length > SHOW_LIMIT) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'library-show-more';
        toggleBtn.textContent = expanded ? 'Скрыть' : `Показать все (${items.length})`;
        toggleBtn.onclick = () => {
          if (expanded) _libraryExpanded.delete(sectionKey);
          else _libraryExpanded.add(sectionKey);
          renderLibrary();
        };
        head.appendChild(toggleBtn);
      }
    };
    renderSection('Мои плейлисты', ownPlaylists, 'own');
    renderSection('Любимые плейлисты', likedPlaylists, 'likedPl');
    renderSection('Любимые альбомы', likedAlbums, 'likedAl');
    renderSidebarPlaylists();
  }

  async function loadLibrary(uid) {
    const sections = { ownPlaylists: [], likedPlaylists: [], likedAlbums: [] };

    // 1. "Мне нравится" — virtual playlist of liked tracks → first own item
    try {
      const likes = await yaCall(`/users/${encodeURIComponent(uid)}/likes/tracks`);
      const likedIds = (likes.result?.library?.tracks || []).map(t => String(t.id));
      if (likedIds.length) {
        sections.ownPlaylists.push({
          kind: 'likes',
          uid,
          title: 'Мне нравится',
          subtitle: ymAccount?.login || '',
          trackCount: likedIds.length,
          cover: null,
          accent: '#ff3b6b',
          icon: '♥',
          trackIds: likedIds,
          loader: () => materializeTracks({ tracks: likedIds.map(id => ({ id })) }),
        });
      }
    } catch (e) { console.warn('[YM] likes failed:', e.message); }

    // 2. User's own playlists
    try {
      const lst = await yaCall(`/users/${encodeURIComponent(uid)}/playlists/list`);
      (lst.result || []).forEach(p => {
        sections.ownPlaylists.push({
          kind: 'playlist',
          uid,
          playlistKind: p.kind,
          title: p.title,
          subtitle: p.owner?.login || ymAccount?.login || '',
          trackCount: p.trackCount,
          cover: p.cover?.uri || p.ogImage,
          loader: async () => {
            const r = await yaCall(`/users/${encodeURIComponent(uid)}/playlists/${encodeURIComponent(p.kind)}`);
            return materializeTracks(r.result);
          },
        });
      });
    } catch (e) { console.warn('[YM] playlists list failed:', e.message); }

    // 3. Liked playlists (other people's playlists user liked)
    try {
      const lp = await yaCall(`/users/${encodeURIComponent(uid)}/likes/playlists`);
      (lp.result || []).forEach(entry => {
        const p = entry.playlist || entry;
        if (!p?.title) return;
        sections.likedPlaylists.push({
          kind: 'playlist',
          uid: p.owner?.uid || p.uid,
          playlistKind: p.kind,
          title: p.title,
          subtitle: p.owner?.name || p.owner?.login || '',
          trackCount: p.trackCount,
          cover: p.cover?.uri || p.ogImage,
          loader: async () => {
            const r = await yaCall(`/users/${encodeURIComponent(p.owner?.uid || p.uid)}/playlists/${encodeURIComponent(p.kind)}`);
            return materializeTracks(r.result);
          },
        });
      });
    } catch (e) { console.warn('[YM] liked playlists failed:', e.message); }

    // 4. Liked albums — response shape varies: top-level array OR { library: { albums: [...] } }
    //    Each item may be a bare album, { album: {...} }, or an id-only ref.
    try {
      const la = await yaCall(`/users/${encodeURIComponent(uid)}/likes/albums`);
      console.log('[YM] liked albums raw:', la);
      const rawAlbums = la.result?.library?.albums || la.result?.albums || la.result || [];
      // If items are id-only refs, fetch full albums in one batch.
      const albums = [];
      const needsFetch = [];
      for (const entry of rawAlbums) {
        const a = entry.album || entry;
        if (a?.title) {
          albums.push(a);
        } else if (a?.id || entry.id) {
          needsFetch.push(String(a?.id || entry.id));
        }
      }
      if (needsFetch.length) {
        try {
          const r = await sdk.fetch(YA_API + '/albums', {
            method: 'POST',
            headers: { ...HEADERS_BASE, Authorization: 'OAuth ' + token, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'album-ids=' + needsFetch.join(','),
            responseType: 'json',
          });
          if (r.status < 400) (r.data?.result || []).forEach(a => albums.push(a));
        } catch (e) { console.warn('[YM] bulk albums fetch failed:', e.message); }
      }
      albums.forEach(a => {
        if (!a?.title) return;
        sections.likedAlbums.push({
          kind: 'album',
          albumId: a.id,
          title: a.title,
          subtitle: (a.artists || []).map(ar => ar.name).join(', '),
          trackCount: a.trackCount,
          cover: a.coverUri,
          loader: async () => {
            const r = await yaCall(`/albums/${a.id}/with-tracks`);
            return (r.result?.volumes || []).flat().map(normalizeTrack);
          },
        });
      });
    } catch (e) { console.warn('[YM] liked albums failed:', e.message); }

    return sections;
  }

  function renderLibraryCard(p) {
    const div = document.createElement('div');
    div.className = 'library-card';
    const cover = p.cover ? `https://${p.cover.replace('%%', '200x200')}` : '';
    div.innerHTML = `
      <div class="library-cover" style="${cover ? `background-image:url('${cover}')` : `background:linear-gradient(135deg, ${p.accent || '#3a3a44'}, #1a1a22)`}">
        ${p.icon ? `<span class="library-cover-icon">${p.icon}</span>` : ''}
      </div>
      <div class="library-meta">
        <div class="library-title">${escape(p.title)}</div>
        <div class="library-count">${p.subtitle ? escape(p.subtitle) + ' · ' : ''}${p.trackCount || 0} трек.</div>
      </div>
    `;
    div.addEventListener('click', () => openItemPage(p));
    return div;
  }

  /** Full-screen view of the current playback queue. */
  function openQueuePage() {
    $('#search-bar-host').innerHTML = '';
    main.innerHTML = `
      <div class="page-header">
        <button id="page-back" class="page-back-btn" title="Назад">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          Назад
        </button>
      </div>
      <div class="page-hero">
        <div class="page-hero-cover" id="page-cover" style="background:linear-gradient(135deg, #ffcc00, #b38b00)">
          <span class="page-cover-icon">♬</span>
        </div>
        <div class="page-hero-body">
          <div class="page-hero-kind">Сейчас в очереди</div>
          <h1 class="page-hero-title">Очередь</h1>
          <div class="page-hero-subtitle" id="page-queue-count">${queue.length} треков</div>
          <div class="page-hero-actions">
            <button id="page-clear" class="page-secondary-btn">Очистить</button>
          </div>
        </div>
      </div>
      <div id="queue-page-tracks" class="track-list"></div>
    `;
    $('#page-back').addEventListener('click', renderSearchScreen);
    $('#page-clear').addEventListener('click', () => {
      // Don't stop the current track — let it finish. Just drop everything else
      // from the queue. If nothing is playing, clear entirely.
      if (currentIndex >= 0 && currentIndex < queue.length) {
        queue = [queue[currentIndex]];
        currentIndex = 0;
      } else {
        queue = [];
        currentIndex = -1;
      }
      renderQueue();
    });
    renderQueuePageTracks();
  }

  function renderQueuePageTracks() {
    const list = $('#queue-page-tracks');
    const count = $('#page-queue-count');
    if (count) count.textContent = `${queue.length} треков`;
    if (!list) return;
    if (!queue.length) {
      list.innerHTML = '<div class="empty">Очередь пуста — добавь треки из медиатеки или поиска.</div>';
      return;
    }
    list.innerHTML = '';
    queue.forEach((t, i) => {
      const row = renderTrackRow(t, true, i);
      list.appendChild(row);
    });
  }

  /** Full-screen view of a playlist/album with hero + filter + tracks. */
  async function openItemPage(p) {
    $('#search-bar-host').innerHTML = ''; // hide global search on item page
    main.innerHTML = `
      <div class="page-header">
        <button id="page-back" class="page-back-btn" title="Назад в медиатеку">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          Назад
        </button>
      </div>
      <div class="page-hero">
        <div class="page-hero-cover" id="page-cover"></div>
        <div class="page-hero-body">
          <div class="page-hero-kind">${p.kind === 'album' ? 'Альбом' : 'Плейлист'}</div>
          <h1 class="page-hero-title">${escape(p.title)}</h1>
          ${p.subtitle ? `<div class="page-hero-subtitle">${escape(p.subtitle)}</div>` : ''}
          <div class="page-hero-actions">
            <button id="page-play-all" class="page-play-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              Слушать
            </button>
            <button id="page-add-all" class="page-secondary-btn">+ В очередь</button>
          </div>
        </div>
      </div>
      <div class="page-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="page-filter" type="text" placeholder="Поиск трека в плейлисте…" autocomplete="off" />
      </div>
      <div id="page-tracks" class="track-list">
        <div class="loading">Загружаю треки…</div>
      </div>
    `;

    const cover = p.cover ? `https://${p.cover.replace('%%', '400x400')}` : '';
    if (cover) {
      $('#page-cover').style.backgroundImage = `url('${cover}')`;
    } else {
      $('#page-cover').style.background = `linear-gradient(135deg, ${p.accent || '#3a3a44'}, #1a1a22)`;
      if (p.icon) $('#page-cover').innerHTML = `<span class="page-cover-icon">${p.icon}</span>`;
    }

    $('#page-back').addEventListener('click', renderSearchScreen);

    let tracks = [];
    try {
      tracks = await p.loader();
    } catch (e) {
      $('#page-tracks').innerHTML = `<div class="banner error">Не удалось загрузить: ${escape(e.message)}</div>`;
      return;
    }
    if (!tracks.length) {
      $('#page-tracks').innerHTML = '<div class="empty">Пусто.</div>';
      return;
    }

    const renderTracks = (filter) => {
      const list = $('#page-tracks');
      list.innerHTML = '';
      const filtered = filter
        ? tracks.filter(t =>
            t.title?.toLowerCase().includes(filter) ||
            t.artists?.some(a => a.toLowerCase().includes(filter)))
        : tracks;
      if (!filtered.length) { list.innerHTML = '<div class="empty">Ничего не найдено.</div>'; return; }
      filtered.forEach((t, i) => {
        const row = renderTrackRow(t, false);
        row.dataset.rowHandled = '1';
        // Click row → play this single track immediately
        row.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          exitWave();
          const idx = tracks.indexOf(t);
          const startIdx = queue.length;
          tracks.slice(idx).forEach(tr => queue.push(tr));
          renderQueue();
          playIndex(startIdx);
        });
        list.appendChild(row);
      });
    };
    renderTracks('');

    $('#page-filter').addEventListener('input', (e) => {
      renderTracks(e.target.value.trim().toLowerCase());
    });

    $('#page-play-all').addEventListener('click', () => {
      exitWave();
      const startIdx = queue.length;
      tracks.forEach(t => queue.push(t));
      renderQueue();
      playIndex(startIdx);
    });
    $('#page-add-all').addEventListener('click', () => {
      tracks.forEach(t => queue.push(t));
      renderQueue();
    });
  }

  function renderVoiceJoinButton() {
    const b = $('#voice-banner');
    if (!b) return;
    if (!init.voiceChannelId) {
      b.innerHTML = '<div class="banner warn"><span>Зайди в голосовой канал в Zvon, чтобы транслировать музыку.</span></div>';
      return;
    }
    if (presence) {
      b.innerHTML = `
        <div class="banner info">
          <span>🎵 Активна в голосовом канале — другие участники слышат и могут управлять плеером.</span>
          <button id="leave-voice-btn">Отключиться</button>
        </div>`;
      $('#leave-voice-btn').addEventListener('click', leaveVoicePresence);
    } else {
      b.innerHTML = `
        <div class="banner info">
          <span>Готов выйти в эфир — другие участники увидят плеер с обложкой и кнопками.</span>
          <button id="join-voice-btn" class="primary">Включиться в голосовой канал</button>
        </div>`;
      $('#join-voice-btn').addEventListener('click', joinVoicePresence);
    }
  }

  async function joinVoicePresence() {
    if (presence) return;
    try {
      presence = await sdk.voicePresence.create({
        displayName: 'Яндекс Музыка',
        avatar: 'https://music.yandex.ru/favicon.ico',
      });
      presence.on('control', onPresenceControl);
      await presence.setAccentColor('#ffcc00');
      await presence.setControls(getControlSchema());
      // If we are already playing a track, immediately publish audio + cover + subtitle.
      if (audio && !audio.paused && audio.src) await reattachPresenceMedia();
    } catch (e) {
      alert('Не получилось встать в голосовой канал: ' + e.message);
      presence = null;
    }
    renderVoiceJoinButton();
  }

  async function leaveVoicePresence() {
    if (!presence) return;
    try { await presence.destroy(); } catch {}
    presence = null;
    renderVoiceJoinButton();
  }

  function getControlSchema() {
    const t = queue[currentIndex];
    const isPaused = !audio || audio.paused;
    return [
      { id: 'prev', kind: 'button', label: '⏮', tooltip: 'Предыдущий', style: '' },
      { id: 'play-pause', kind: 'button', label: isPaused ? '▶' : '⏸', tooltip: 'Пауза', style: 'primary' },
      { id: 'next', kind: 'button', label: '⏭', tooltip: 'Следующий', style: '' },
      { id: 'seek', kind: 'slider', label: 'Прогресс',
        min: 0, max: 100,
        value: t && audio && isFinite(audio.duration) ? Math.round((audio.currentTime / audio.duration) * 100) : 0,
      },
    ];
  }

  function onPresenceControl({ controlId, value }) {
    if (controlId === 'play-pause') audio && (audio.paused ? audio.play() : audio.pause());
    else if (controlId === 'next') {
      if (waveMode) sendWaveFeedback('skip', { trackId: queue[currentIndex]?.id, totalPlayedSeconds: Math.round(audio?.currentTime || 0) });
      if (currentIndex < queue.length - 1) playIndex(currentIndex + 1);
    }
    else if (controlId === 'prev') { if (currentIndex > 0) playIndex(currentIndex - 1); }
    else if (controlId === 'seek' && audio && isFinite(audio.duration)) audio.currentTime = (Number(value) / 100) * audio.duration;
  }

  async function updatePresenceControls() {
    if (!presence) return;
    try {
      // setControls replaces the whole schema — keeps shuffle/play-pause styles in sync.
      await presence.setControls(getControlSchema());
    } catch {}
  }

  function pushPresenceProgress() {
    if (!presence) return;
    if (!isFinite(audio.duration) || audio.duration === 0) return;
    const pct = Math.round((audio.currentTime / audio.duration) * 100);
    // Throttle: only push when value actually changes (1% steps).
    if (pushPresenceProgress._last === pct) return;
    pushPresenceProgress._last = pct;
    presence.updateControl('seek', { value: pct }).catch(() => {});
  }

  // Достаёт URL видео-клипа трека из Yandex supplement (кэш по trackId).
  const _videoShotCache = new Map();
  async function getVideoShot(track) {
    if (!track?.id) return null;
    if (_videoShotCache.has(track.id)) return _videoShotCache.get(track.id);
    let url = null;
    try {
      const sup = await yaCall(`/tracks/${track.id}/supplement`);
      const r = sup.result || {};
      const pickUrl = (c) => {
        if (!c) return null;
        if (typeof c === 'string') return c;
        // Я.Музыка videos: { provider:'youtube', providerVideoId, embed, ... } — без готового url.
        if (c.providerVideoId) {
          return String(c.provider || '').toLowerCase().includes('youtube')
            ? `https://www.youtube.com/watch?v=${c.providerVideoId}`
            : c.providerVideoId;
        }
        if (c.embed) {
          const m = String(c.embed).match(/(?:youtube\.com\/embed\/|youtu\.be\/|watch\?v=)([\w-]{11})/);
          if (m) return `https://www.youtube.com/watch?v=${m[1]}`;
        }
        return c.uri || c.url || c.streamUri || c.streamUrl || c.embedUrl || c.previewUrl || c.player?.url || null;
      };
      const candidates = [
        r.videoShot, r.video, r.musicVideo, r.videoSupplement,
        ...(Array.isArray(r.videoShots) ? r.videoShots : []),
        ...(Array.isArray(r.videoSupplement?.videoShots) ? r.videoSupplement.videoShots : []),
        ...(Array.isArray(r.clips) ? r.clips : []),   // нативные клипы Я.Музыки (стримятся)
        ...(Array.isArray(r.videos) ? r.videos : []), // обычно ссылки на YouTube
      ];
      for (const c of candidates) {
        const u = pickUrl(c);
        if (u) { url = u.startsWith('http') ? u : ('https://' + u); break; }
      }
      if (!url) {
        // Логируем реальную структуру videos/clips — по ней доработаем извлечение URL.
        console.log('[YM] no playable video url for', track.id,
          '| clips:', JSON.stringify(r.clips), '| videos:', JSON.stringify(r.videos));
      } else {
        console.log('[YM] video url:', url);
      }
    } catch (e) { console.warn('[YM] supplement failed for', track.id, e.message); }
    _videoShotCache.set(track.id, url);
    return url;
  }

  function parseYouTubeId(u) {
    if (!u) return null;
    const m = String(u).match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : null;
  }

  // Показ видео-клипа в самом окне плеера (поверх обложки).
  async function applyPlayerVideo(track) {
    const coverEl = $('#player-cover');
    if (!coverEl) return;
    const url = await getVideoShot(track);
    // трек мог смениться, пока шёл запрос
    if (queue[currentIndex]?.id !== track?.id) return;
    // сбрасываем предыдущее медиа
    coverEl.querySelectorAll('.np-video, .np-frame').forEach(el => el.remove());
    if (!url) return;
    coverEl.style.position = 'relative';
    const ytId = parseYouTubeId(url);
    if (ytId) {
      // YouTube-клип (поле videos) — встраиваем iframe.
      const f = document.createElement('iframe');
      f.className = 'np-frame';
      f.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&controls=0&modestbranding=1&playsinline=1`;
      f.allow = 'autoplay; encrypted-media';
      f.setAttribute('frameborder', '0');
      f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:inherit;';
      coverEl.appendChild(f);
    } else {
      // Прямой видео-файл/клип (например нативный clip Я.Музыки).
      const vid = document.createElement('video');
      vid.className = 'np-video';
      vid.muted = true; vid.loop = true; vid.playsInline = true; vid.autoplay = true;
      vid.src = url;
      vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;';
      coverEl.appendChild(vid);
      vid.play().catch(() => {});
    }
  }

  async function reattachPresenceMedia() {
    if (!presence) return;
    const track = queue[currentIndex];

    // Видео-клип трека (Yandex "video shot"): фон presence-плитки.
    const videoUrl = await getVideoShot(track);

    if (videoUrl) {
      await presence.setBackground({ type: 'video', url: videoUrl });
    } else if (track?.coverUri) {
      const url = 'https://' + track.coverUri.replace('%%', '400x400');
      await presence.setBackground({ type: 'image', url });
    }

    // "Now playing" subtitle — e.g. "Lose Yourself — Eminem"
    if (track) {
      const artists = (track.artists || []).join(', ');
      const subtitle = artists ? `${track.title} — ${artists}` : track.title;
      try { await presence.setSubtitle(subtitle); } catch {}
    }

    // The capture track is stable across audio src changes (Web Audio dest),
    // so publishing once is enough. The bridge no-ops on repeat publishes of
    // the same track to avoid LiveKit republish thrashing.
    try {
      const at = getCaptureTrack();
      if (at) await presence.publishAudio(at);
    } catch (e) { console.error('[YM] presence publishAudio failed:', e); }
    await presence.setControls(getControlSchema());
  }

  async function doSearch(query) {
    query = (query || '').trim();
    const results = $('#results');
    const section = $('#results-section');
    if (!query) {
      if (results) results.innerHTML = '';
      if (section) section.hidden = true;
      return;
    }
    if (section) section.hidden = false;

    // If query is a Yandex Music URL, parse and load tracks directly.
    const parsed = parseYandexUrl(query);
    if (parsed) {
      results.innerHTML = '<div class="loading">Загружаю…</div>';
      try {
        const tracks = await loadByUrl(parsed);
        if (!tracks.length) { results.innerHTML = '<div class="empty">Ничего не загрузилось</div>'; return; }
        results.innerHTML = `<div class="banner info"><span>Загружено ${tracks.length} треков из ${labelKind(parsed.kind)}</span></div>`;
        const actions = document.createElement('div');
        actions.className = 'bulk-actions';
        const playAllBtn = document.createElement('button');
        playAllBtn.className = 'primary';
        playAllBtn.textContent = `▶ Играть всё`;
        playAllBtn.onclick = async () => {
          const startIdx = queue.length;
          tracks.forEach(t => queue.push(t));
          renderQueue();
          await playIndex(startIdx);
        };
        const addAllBtn = document.createElement('button');
        addAllBtn.textContent = `+ В очередь`;
        addAllBtn.onclick = () => { tracks.forEach(t => queue.push(t)); renderQueue(); };
        actions.appendChild(playAllBtn);
        actions.appendChild(addAllBtn);
        results.appendChild(actions);
        tracks.forEach(t => results.appendChild(renderTrackRow(t, false)));
      } catch (e) {
        results.innerHTML = `<div class="banner error">Не получилось загрузить: ${escape(e.message)}</div>`;
      }
      return;
    }

    results.innerHTML = '<div class="loading">Поиск…</div>';
    try {
      const r = await yaCall('/search?type=track&page=0&text=' + encodeURIComponent(query));
      const tracks = (r.result?.tracks?.results || []).slice(0, 25);
      if (!tracks.length) { results.innerHTML = '<div class="empty">Ничего не найдено</div>'; return; }
      results.innerHTML = '';
      tracks.forEach(t => results.appendChild(renderTrackRow(normalizeTrack(t), false)));
    } catch (e) {
      results.innerHTML = `<div class="banner error">Ошибка: ${escape(e.message)}</div>`;
    }
  }

  function parseYandexUrl(s) {
    if (!/music\.yandex\.[a-z]+/i.test(s)) return null;
    const clean = s.split('?')[0].split('#')[0];
    let m;
    if ((m = clean.match(/\/album\/(\d+)\/track\/(\d+)/))) return { kind: 'track', id: m[2] };
    if ((m = clean.match(/\/track\/(\d+)/))) return { kind: 'track', id: m[1] };
    if ((m = clean.match(/\/users\/([^/]+)\/playlists\/([^/]+)/))) return { kind: 'playlist', owner: m[1], pid: m[2] };
    if ((m = clean.match(/\/playlists\/([^/]+)/))) return { kind: 'playlist', owner: null, pid: m[1] };
    if ((m = clean.match(/\/album\/(\d+)/))) return { kind: 'album', id: m[1] };
    return null;
  }

  function labelKind(k) { return { track: 'трека', album: 'альбома', playlist: 'плейлиста' }[k] || k; }

  async function loadByUrl(p) {
    if (p.kind === 'track') {
      const r = await yaCall(`/tracks?track-ids=${p.id}`);
      const t = r.result?.[0];
      if (!t) throw new Error('Трек не найден');
      return [normalizeTrack(t)];
    }
    if (p.kind === 'album') {
      const r = await yaCall(`/albums/${p.id}/with-tracks`);
      const vols = r.result?.volumes || [];
      return vols.flat().map(normalizeTrack);
    }
    if (p.kind === 'playlist') {
      // Share-link IDs are UUIDs (with prefix like "ps.", "lk.", etc.).
      // Personal user playlists use integer `kind`.
      const looksUuid = !p.owner || /[a-f0-9-]{8,}/i.test(p.pid);
      const errors = [];

      if (looksUuid) {
        // Endpoint 1: path-style UUID
        try {
          const r = await yaCall(`/playlist/${encodeURIComponent(p.pid)}`);
          const tracks = await materializeTracks(r.result);
          if (tracks.length) return tracks;
        } catch (e) { errors.push('GET /playlist/{uuid}: ' + e.message); }

        // Endpoint 2: legacy query-style
        try {
          const r = await yaCall(`/playlist?playlistId=${encodeURIComponent(p.pid)}`);
          const tracks = await materializeTracks(r.result);
          if (tracks.length) return tracks;
        } catch (e) { errors.push('GET /playlist?playlistId: ' + e.message); }

        // Endpoint 3: bulk POST
        try {
          const r = await sdk.fetch(YA_API + '/playlists/list', {
            method: 'POST',
            headers: { ...HEADERS_BASE, Authorization: 'OAuth ' + token, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'playlistIds=' + encodeURIComponent(p.pid),
            responseType: 'json',
          });
          if (r.status < 400) {
            const pl = (r.data?.result || [])[0];
            const tracks = await materializeTracks(pl);
            if (tracks.length) return tracks;
          } else {
            errors.push('POST /playlists/list: ' + r.status);
          }
        } catch (e) { errors.push('POST /playlists/list: ' + e.message); }
      }

      if (p.owner) {
        const r = await yaCall(`/users/${encodeURIComponent(p.owner)}/playlists/${encodeURIComponent(p.pid)}`);
        const tracks = await materializeTracks(r.result);
        if (tracks.length) return tracks;
        errors.push('GET /users/{owner}/playlists/{kind}: empty');
      }

      throw new Error('Не удалось загрузить плейлист. ' + errors.join('; '));
    }
    return [];
  }

  // Some endpoints return tracks as full objects, others as { id, albumId } refs.
  // Refs need a second call to /tracks to fetch full metadata.
  async function materializeTracks(playlist) {
    if (!playlist) return [];
    const raw = playlist.tracks || [];
    if (!raw.length) return [];
    // Detect ref-style (no .track field, no .title)
    const isRef = raw.every(it => !it.track && !it.title && (it.id || it.trackId));
    if (!isRef) {
      return raw.map(it => normalizeTrack(it.track || it));
    }
    const ids = raw.map(it => String(it.id || it.trackId).split(':')[0]);
    const chunks = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
    const all = [];
    for (const c of chunks) {
      const r = await sdk.fetch(YA_API + '/tracks', {
        method: 'POST',
        headers: { ...HEADERS_BASE, Authorization: 'OAuth ' + token, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'track-ids=' + c.join(','),
        responseType: 'json',
      });
      if (r.status < 400) (r.data?.result || []).forEach(t => all.push(normalizeTrack(t)));
    }
    return all;
  }

  function renderQueue() {
    updateQueueBadge();
    // If queue page is currently open, refresh it too.
    if ($('#queue-page-tracks')) renderQueuePageTracks();
  }

  // ---------- Страница исполнителя (§30–31) ----------
  // Куда возвращает «Назад» с вложенной страницы. Ставится экранами верхнего
  // уровня, чтобы с исполнителя не выкидывало всегда в поиск.
  let backTarget = renderSearchScreen;

  async function openArtistPage(artistId, fallbackName) {
    if (!artistId) return;
    closeSheet();
    const back = backTarget;
    $('#search-bar-host').innerHTML = '';
    main.innerHTML = `
      <div class="page-header">
        <button id="artist-back" class="page-back-btn" title="Назад">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          Назад
        </button>
      </div>
      <div class="page-hero">
        <div class="page-hero-cover round" id="artist-cover"></div>
        <div class="page-hero-body">
          <div class="page-hero-kind">Исполнитель</div>
          <h1 class="page-hero-title" id="artist-name">${escape(fallbackName || '')}</h1>
          <div class="page-hero-subtitle" id="artist-stats"></div>
          <div class="page-hero-actions">
            <button id="artist-play" class="page-play-btn" disabled>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              Слушать
            </button>
            <button id="artist-queue" class="page-secondary-btn" disabled>+ В очередь</button>
          </div>
        </div>
      </div>
      <div id="artist-sections"><div class="loading">Загружаю исполнителя…</div></div>`;
    $('#artist-back').addEventListener('click', () => back());

    let r;
    try { r = (await yaCall(`/artists/${encodeURIComponent(artistId)}/brief-info`))?.result; }
    catch (e) {
      $('#artist-sections').innerHTML = `<div class="banner error">Не удалось загрузить исполнителя: ${escape(e.message)}</div>`;
      return;
    }
    if (!r?.artist) { $('#artist-sections').innerHTML = '<div class="empty">Исполнитель не найден.</div>'; return; }

    const a = r.artist;
    $('#artist-name').textContent = a.name || fallbackName || '';
    const photo = a.cover?.uri || a.ogImage;
    if (photo) $('#artist-cover').style.backgroundImage = `url('https://${photo.replace('%%', '400x400')}')`;

    const stats = [];
    if (r.stats?.lastMonthListeners) stats.push(fmtListeners(r.stats.lastMonthListeners));
    if (a.genres?.length) stats.push(a.genres.slice(0, 3).join(', '));
    $('#artist-stats').textContent = stats.join(' · ');

    const popular = (r.popularTracks || []).map(normalizeTrack);
    if (popular.length) {
      const playBtn = $('#artist-play'), queueBtn = $('#artist-queue');
      playBtn.disabled = queueBtn.disabled = false;
      playBtn.addEventListener('click', () => {
        exitWave();
        const start = queue.length;
        popular.forEach(t => queue.push(t));
        renderQueue();
        playIndex(start);
      });
      queueBtn.addEventListener('click', () => popular.forEach(t => addToQueue(t)));
    }

    const host = $('#artist-sections');
    host.innerHTML = '';

    if (popular.length) {
      host.appendChild(sectionTitle('Популярные треки'));
      const list = document.createElement('div');
      list.className = 'track-list';
      popular.slice(0, 10).forEach(t => list.appendChild(renderTrackRow(t, false)));
      host.appendChild(list);
    }

    const albums = [...(r.albums || []), ...(r.alsoAlbums || [])];
    if (albums.length) {
      host.appendChild(sectionTitle('Альбомы'));
      host.appendChild(cardRow(albums.slice(0, 12).map(al => ({
        title: al.title || '',
        sub: [al.year, al.trackCount ? al.trackCount + ' треков' : null].filter(Boolean).join(' · '),
        cover: al.coverUri,
        onClick: () => openItemPage({
          kind: 'album', title: al.title || '', subtitle: a.name || '', cover: al.coverUri,
          loader: () => loadByUrl({ kind: 'album', id: al.id }),
        }),
      }))));
    }

    const similar = r.similarArtists || r.similar || [];
    if (similar.length) {
      host.appendChild(sectionTitle('Похожие исполнители'));
      host.appendChild(cardRow(similar.slice(0, 12).map(s => ({
        title: s.name || '',
        sub: 'Исполнитель',
        cover: s.cover?.uri || s.ogImage,
        round: true,
        onClick: () => openArtistPage(s.id, s.name),
      }))));
    }

    // «Интересный факт» здесь показываем целиком — это конечная точка, с
    // которой уже некуда вести «Подробнее».
    const about = a.description?.text?.trim();
    if (about) {
      const card = document.createElement('article');
      card.className = 'ai-insight expanded';
      card.innerHTML = `
        <div class="ai-insight-head"><span class="ai-mark">✦</span>Интересный факт</div>
        <p class="ai-insight-body">${escape(about)}</p>`;
      host.appendChild(sectionTitle('Об исполнителе'));
      host.appendChild(card);
    }

    if (!host.children.length) host.innerHTML = '<div class="empty">Об этом исполнителе пока нечего показать.</div>';
  }

  function sectionTitle(text) {
    const el = document.createElement('div');
    el.className = 'library-section-title';
    el.textContent = text;
    return el;
  }

  // Ряд карточек (альбомы, похожие исполнители) — та же сетка, что в медиатеке.
  function cardRow(items) {
    const row = document.createElement('div');
    row.className = 'library-row';
    items.forEach(it => {
      const card = document.createElement('div');
      card.className = 'library-card';
      const cover = it.cover ? `https://${it.cover.replace('%%', '200x200')}` : '';
      card.innerHTML = `
        <div class="library-cover${it.round ? ' round' : ''}"${cover ? ` style="background-image:url('${cover}')"` : ''}></div>
        <div class="library-meta">
          <div class="library-title">${escape(it.title)}</div>
          <div class="library-count">${escape(it.sub || '')}</div>
        </div>`;
      card.addEventListener('click', it.onClick);
      row.appendChild(card);
    });
    return row;
  }

  function renderTrackRow(track, inQueue, queueIndex) {
    const div = document.createElement('div');
    div.className = 'track' + (inQueue && queueIndex === currentIndex ? ' current' : '');
    const cover = track.coverUri ? `https://${track.coverUri.replace('%%', '100x100')}` : '';
    div.innerHTML = `
      <div class="track-cover" style="background-image:url('${cover}')"></div>
      <div class="track-meta">
        <div class="track-name">${escape(track.title)}</div>
        <div class="track-artist">${escape(track.artists.join(', '))}</div>
      </div>
      <div class="track-duration">${fmtMs(track.durationMs)}</div>
      <div class="track-actions"></div>
    `;
    const actions = div.querySelector('.track-actions');
    if (inQueue) {
      const playBtn = document.createElement('button');
      playBtn.className = 'primary';
      playBtn.textContent = '▶ Играть';
      playBtn.addEventListener('click', (e) => { e.stopPropagation(); playIndex(queueIndex); });
      const rmBtn = document.createElement('button');
      rmBtn.textContent = 'Убрать';
      rmBtn.addEventListener('click', (e) => { e.stopPropagation(); removeFromQueue(queueIndex); });
      actions.appendChild(playBtn); actions.appendChild(rmBtn);
      div.addEventListener('click', () => playIndex(queueIndex));
    } else {
      const playNow = document.createElement('button');
      playNow.className = 'primary';
      playNow.textContent = '▶ Играть';
      playNow.addEventListener('click', (e) => { e.stopPropagation(); addAndPlay(track); });
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ В очередь';
      addBtn.addEventListener('click', (e) => { e.stopPropagation(); addToQueue(track); });
      actions.appendChild(playNow); actions.appendChild(addBtn);
      // Тап по строке играет трек. На телефоне текстовых кнопок в строке нет,
      // поэтому без этого трек было бы не запустить одним касанием.
      div.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        if (div.dataset.rowHandled) return;   // страница вешает свой обработчик
        addAndPlay(track);
      });
    }
    // «⋯» — контекстное меню трека (§38)
    const moreBtn = document.createElement('button');
    moreBtn.className = 'track-more';
    moreBtn.title = 'Ещё';
    moreBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTrackMenu(track, { inQueue, queueIndex });
    });
    actions.appendChild(moreBtn);
    return div;
  }

  function normalizeTrack(t) {
    return {
      id: String(t.id).split(':')[0],
      title: t.title || '',
      artists: (t.artists || []).map(a => a.name),
      artistIds: (t.artists || []).map(a => a.id).filter(Boolean),
      durationMs: t.durationMs || 0,
      coverUri: t.coverUri || t.albums?.[0]?.coverUri,
      albumId: t.albums?.[0]?.id,
      albumTitle: t.albums?.[0]?.title || '',
    };
  }

  function addToQueue(track) {
    queue.push(track);
    renderQueue();
  }
  function removeFromQueue(idx) {
    if (idx === currentIndex) { stopPlayback(); queue.splice(idx, 1); }
    else {
      queue.splice(idx, 1);
      if (idx < currentIndex) currentIndex--;
    }
    renderQueue();
  }
  async function addAndPlay(track) {
    exitWave();
    queue.push(track);
    renderQueue();
    await playIndex(queue.length - 1);
  }

  // ---------- "Моя волна" (rotor radio) ----------

  async function fetchWaveBatch(prevTrackId) {
    let path = `/rotor/station/${waveStation}/tracks?settings2=true`;
    if (prevTrackId) path += `&queue=${encodeURIComponent(prevTrackId)}`;
    const data = await yaCall(path);
    if (data.result?.batchId) waveBatchId = data.result.batchId;
    const seq = data.result?.sequence || [];
    return seq.map(s => s.track).filter(Boolean).map(normalizeTrack);
  }

  // Best-effort: rotor personalizes "Моя волна" from these play/skip events.
  function sendWaveFeedback(type, extra) {
    const body = Object.assign({ type, from: 'zvon-radio', timestamp: new Date().toISOString() }, extra || {});
    let path = `/rotor/station/${waveStation}/feedback`;
    if (waveBatchId && type !== 'radioStarted') path += `?batch-id=${encodeURIComponent(waveBatchId)}`;
    sdk.fetch(YA_API + path, {
      method: 'POST',
      headers: { ...HEADERS_BASE, Authorization: 'OAuth ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      responseType: 'json',
    }).catch(e => console.warn('[YM] wave feedback failed:', type, e.message));
  }

  async function startWave(stationId) {
    if (waveLoading) return;
    if (stationId) waveStation = stationId;
    const card = $('#wave-card');
    if (card) card.classList.add('loading');
    waveLoading = true;
    try {
      sendWaveFeedback('radioStarted', { from: 'zvon-radio-' + waveStation });
      const tracks = await fetchWaveBatch(null);
      if (!tracks.length) throw new Error('пустой ответ от rotor');
      waveMode = true;
      queue = tracks.slice();
      currentIndex = -1;
      renderQueue();
      updateQueueBadge();
      if (card) card.classList.remove('loading');
      waveLoading = false;
      await playIndex(0); // may kick off its own refill (manages waveLoading)
    } catch (e) {
      waveMode = false;
      waveLoading = false;
      if (card) card.classList.remove('loading');
      console.error('[YM] wave start failed:', e);
      const sub = card?.querySelector('.wave-card-sub');
      if (sub) sub.textContent = 'Не удалось запустить: ' + e.message;
      // На экране My Vibe карточки нет — показываем ошибку в пилюле под заголовком.
      const vt = $('#vibe-track');
      if (vt) { vt.style.display = ''; vt.textContent = 'Не удалось запустить станцию (' + e.message + ')'; }
    }
  }

  // Keep the wave flowing: append a fresh batch when the queue runs low.
  function refillWave(prevTrackId) {
    if (!waveMode || waveLoading) return;
    waveLoading = true;
    fetchWaveBatch(prevTrackId)
      .then(more => {
        if (!waveMode || !more?.length) return;
        const have = new Set(queue.map(t => t.id));
        const fresh = more.filter(t => !have.has(t.id));
        if (fresh.length) { fresh.forEach(t => queue.push(t)); renderQueue(); updateQueueBadge(); }
      })
      .catch(e => console.warn('[YM] wave refill failed:', e.message))
      .finally(() => { waveLoading = false; });
  }

  // Leaving wave mode whenever the user starts a hand-picked playlist/track,
  // so the radio stops refilling and feedback stops firing.
  function exitWave() { waveMode = false; waveBatchId = null; }

  // ---------- Playback ----------

  async function playIndex(index, _attemptedSet) {
    if (index < 0 || index >= queue.length) return;
    // Guard against infinite skip loops if everything is blocked.
    const attempted = _attemptedSet || new Set();
    if (attempted.has(index)) { console.warn('[YM] all remaining tracks failed, stopping'); stopPlayback(); return; }
    attempted.add(index);

    currentIndex = index;
    renderQueue();
    const track = queue[index];
    showPlayer(track, true);

    const skipToNext = (reason) => {
      console.warn('[YM] skipping track:', track.title, '—', reason);
      if (currentIndex < queue.length - 1) playIndex(currentIndex + 1, attempted);
      else { showPlayer(track, false, reason); stopPlayback(); }
    };

    let streamUrl;
    try { streamUrl = await resolveStreamUrl(track.id); }
    catch (e) { return skipToNext('недоступен: ' + e.message); }

    try {
      const r = await sdk.fetch(streamUrl, { responseType: 'arraybuffer', headers: { ...HEADERS_BASE } });
      if (r.status >= 400) return skipToNext('HTTP ' + r.status);
      const bytes = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0));
      if (bytes.length < 1024) return skipToNext('пустой ответ');
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      recreateAudio();
      audio.src = URL.createObjectURL(blob);
      try { await audio.play(); }
      catch (playErr) { return skipToNext('audio.play() ' + playErr.message); }
      showPlayer(track, false);
      pushPresenceProgress._last = -1;
      if (presence) await reattachPresenceMedia();
      if (waveMode) {
        sendWaveFeedback('trackStarted', { trackId: track.id });
        if (index >= queue.length - 2) refillWave(track.id);
      }
    } catch (e) {
      console.error('[YM] playback failed:', e);
      return skipToNext(e.message);
    }
  }

  async function stopPlayback() {
    exitWave();
    if (audio) {
      try { audio.pause(); } catch { }
      audio.removeAttribute('src');
      try { audio.load(); } catch { }
    }
    if (_captureStream) {
      _captureStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
      _captureStream = null;
    }
    currentIndex = -1;
    renderQueue();
    player.classList.add('hidden');
    resetDynamicAccent();
    // When playback ends (queue exhausted or user pressed stop), leave the
    // voice channel — no point in keeping an idle presence tile around.
    if (presence) {
      try { await presence.setSubtitle(null); } catch { }
      try { await presence.destroy(); } catch { }
      presence = null;
      renderVoiceJoinButton();
    }
  }

  function showPlayer(track, loading, errorMsg) {
    player.classList.remove('hidden');
    const cover = track.coverUri ? `https://${track.coverUri.replace('%%', '200x200')}` : '';
    $('#player-cover').style.backgroundImage = `url('${cover}')`;
    // Обложка перекрашивает интерфейс — см. applyDynamicAccent.
    applyDynamicAccent(cover);
    // Видео-клип трека (если есть на Я.Музыке) — показываем поверх обложки в плеере.
    applyPlayerVideo(track);
    updateLikeButton();
    $('#player-title').innerHTML = (loading ? '<span class="spinner"></span> ' : '') + escape(track.title);
    $('#player-artist').textContent = errorMsg || track.artists.join(', ');
    $('#player-duration').textContent = fmtMs(track.durationMs);
    $('#player-elapsed').textContent = '0:00';
    $('#player-bar-fill').style.width = '0%';
    updateVibeNowPlaying(track);
  }

  function updateLocalProgress() {
    if (!isFinite(audio.duration) || audio.duration === 0) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    $('#player-bar-fill').style.width = pct + '%';
    $('#player-elapsed').textContent = fmtSec(audio.currentTime);
  }

  // ---------- Yandex API helpers ----------

  async function yaCall(path) {
    const r = await sdk.fetch(YA_API + path, {
      method: 'GET',
      headers: { ...HEADERS_BASE, Authorization: 'OAuth ' + token },
      responseType: 'json',
    });
    if (r.status >= 400) throw new Error('Yandex API ' + r.status);
    return r.data;
  }

  async function resolveStreamUrl(trackId) {
    const id = String(trackId).split(':')[0];
    const deviceId = randomHex(16);
    const headers = { ...HEADERS_BASE, Authorization: 'OAuth ' + token, 'X-Yandex-Music-Device': deviceId };

    const infoRes = await yaCall(`/tracks/${id}/download-info`);
    const infos = infoRes.result || [];
    if (!infos.length) throw new Error('No download info');
    infos.sort((a, b) => b.bitrateKbps - a.bitrateKbps);
    const fullTrack = infos.find(i => i.codec === 'mp3' && !i.preview);
    if (!fullTrack) {
      throw new Error('Доступно только превью (~30 сек). Нужна подписка Яндекс Плюс или альтернативный вход через Android-клиент.');
    }
    const info = fullTrack;
    const url = info.downloadInfoUrl + (info.downloadInfoUrl.includes('?') ? '&' : '?') + 'format=json';

    const dl = await sdk.fetch(url, { method: 'GET', headers, responseType: 'json' });
    if (dl.status >= 400 || !dl.data?.host) throw new Error('download-info failed (' + dl.status + ')');
    const { host, path, ts, s } = dl.data;
    const sign = await md5('XGRwNC9wZnduYm9n' + path.substring(1) + s);
    return `https://${host}/get-mp3/${sign}/${ts}${path}`;
  }

  // ---------- BottomSheet ----------
  // Общая шторка для контекстного меню (§38) и текста песни (§29).
  // Одновременно открыта только одна: вторая вытесняет первую.
  let openSheetHandle = null;

  function openSheetEl(sheetClass) {
    closeSheet();
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    const sheet = document.createElement('div');
    sheet.className = 'sheet' + (sheetClass ? ' ' + sheetClass : '');
    sheet.innerHTML = '<div class="sheet-handle"></div>';
    backdrop.appendChild(sheet);

    const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeSheet(); });
    document.addEventListener('keydown', onKey);

    const cleanups = [() => document.removeEventListener('keydown', onKey)];
    openSheetHandle = {
      sheet,
      close: () => {
        cleanups.forEach(fn => { try { fn(); } catch { } });
        backdrop.remove();
        openSheetHandle = null;
      },
      onClose: (fn) => cleanups.push(fn),
    };
    document.body.appendChild(backdrop);
    return openSheetHandle;
  }

  function closeSheet() { openSheetHandle?.close(); }

  const MENU_ICONS = {
    play:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    queue:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="15" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="11" y2="18"/><line x1="19" y1="8" x2="19" y2="16"/><line x1="15" y1="12" x2="23" y2="12"/></svg>',
    remove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    heart:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    heartOn:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-10-9A5.4 5.4 0 0 1 12 6.2 5.4 5.4 0 0 1 22 12c-2.5 4.4-10 9-10 9z"/></svg>',
    lyrics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="17" x2="12" y2="17"/></svg>',
    album:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/></svg>',
    share:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/><polyline points="14 4 20 4 20 10"/><line x1="10" y1="14" x2="20" y2="4"/></svg>',
    artist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>',
  };

  // ---------- ContextMenu (§38) ----------
  function openTrackMenu(track, ctx = {}) {
    if (!track) return;
    const h = openSheetEl('menu-sheet');
    const liked = isLiked(track.id);
    const canLike = !!(ymAccount?.uid && token);

    const items = ctx.inQueue
      ? [
          { icon: MENU_ICONS.play, label: 'Играть', action: () => playIndex(ctx.queueIndex) },
          { icon: MENU_ICONS.remove, label: 'Убрать из очереди', action: () => removeFromQueue(ctx.queueIndex) },
        ]
      : [
          { icon: MENU_ICONS.play, label: 'Играть сейчас', action: () => addAndPlay(track) },
          { icon: MENU_ICONS.queue, label: 'Добавить в очередь', action: () => addToQueue(track) },
        ];

    items.push({
      icon: liked ? MENU_ICONS.heartOn : MENU_ICONS.heart,
      label: liked ? 'Убрать из «Мне нравится»' : 'Добавить в «Мне нравится»',
      active: liked,
      disabled: !canLike,
      action: () => toggleLikeFor(track.id),
    });
    items.push({ icon: MENU_ICONS.lyrics, label: 'Текст песни', action: () => openLyricsSheet(track), keepOpen: true });
    if (track.artistIds?.length) {
      items.push({
        icon: MENU_ICONS.artist,
        label: 'Открыть исполнителя',
        action: () => openArtistPage(track.artistIds[0], track.artists[0]),
      });
    }
    if (track.albumId) {
      items.push({
        icon: MENU_ICONS.album,
        label: 'Открыть альбом',
        action: () => openItemPage({
          kind: 'album',
          title: track.albumTitle || track.title,
          subtitle: track.artists.join(', '),
          cover: track.coverUri,
          loader: () => loadByUrl({ kind: 'album', id: track.albumId }),
        }),
      });
    }
    items.push({ icon: MENU_ICONS.share, label: 'Скопировать ссылку', action: (btn) => shareTrack(track, btn), keepOpen: true });

    h.sheet.insertAdjacentHTML('beforeend', `
      <div class="sheet-title">
        ${escape(track.title)}
        <div class="sheet-subtitle">${escape(track.artists.join(', '))}</div>
      </div>
      <div class="menu-list"></div>`);

    const list = h.sheet.querySelector('.menu-list');
    items.forEach(it => {
      const btn = document.createElement('button');
      btn.className = 'menu-item' + (it.active ? ' active' : '');
      if (it.disabled) btn.disabled = true;
      btn.innerHTML = `${it.icon}<span>${escape(it.label)}</span>`;
      btn.addEventListener('click', () => {
        it.action(btn);
        if (!it.keepOpen) closeSheet();
      });
      list.appendChild(btn);
    });
  }

  async function shareTrack(track, btn) {
    const url = `https://music.yandex.ru/track/${track.id}`;
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; }
    catch {
      // В iframe доступ к буферу может быть запрещён политикой — старый способ.
      try {
        const ta = document.createElement('textarea');
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch { ok = false; }
    }
    const label = btn?.querySelector('span');
    if (label) {
      label.textContent = ok ? 'Ссылка скопирована' : 'Не удалось скопировать';
      setTimeout(() => closeSheet(), 900);
    }
  }

  // ---------- Lyrics (§29) ----------
  // Текст берём из /tracks/{id}/supplement — это тот же ответ, из которого уже
  // достаются видеошоты. Если в нём есть таймкоды LRC, строки подсвечиваются по
  // времени; если таймкодов нет, показываем ровный читаемый текст без фальшивой
  // синхронизации.
  const lyricsCache = new Map();

  // Тайм-коды живут за отдельной подписанной ручкой приватного API — той же,
  // которой пользуется официальный клиент (подпись тут делается так же, как для
  // download-info выше). Ручка может отдать ошибку или не знать этот трек —
  // тогда молча откатываемся на обычный текст из supplement.
  const LYRICS_SIGN_KEY = 'p93jhgh689SBReK6ghtw62';

  async function hmacSha256Base64(key, msg) {
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
    let bin = '';
    sig.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  async function loadTimedLyrics(trackId) {
    const ts = Math.floor(Date.now() / 1000);
    const sign = await hmacSha256Base64(LYRICS_SIGN_KEY, `${trackId}${ts}`);
    const r = await yaCall(`/tracks/${trackId}/lyrics?format=LRC&timeStamp=${ts}&sign=${encodeURIComponent(sign)}`);
    const url = r?.result?.downloadUrl;
    if (!url) return null;
    const f = await sdk.fetch(url, { responseType: 'text' });
    if (f.status >= 400) return null;
    const raw = (typeof f.data === 'string' ? f.data : f.text || '').trim();
    return raw || null;
  }

  async function loadLyrics(trackId) {
    // 1. Пробуем текст с таймкодами — только на нём возможно караоке.
    try {
      const lrc = await loadTimedLyrics(trackId);
      if (lrc) {
        const lines = parseLyrics(lrc);
        if (lines.synced) return { lines };
      }
    } catch (e) { console.warn('[YM] timed lyrics unavailable:', e.message); }

    // 2. Иначе — обычный текст из supplement, без подсветки.
    const sup = await yaCall(`/tracks/${trackId}/supplement`);
    const l = sup.result?.lyrics;
    const raw = (l?.fullLyrics || l?.lyrics || '').trim();
    if (!raw) return null;
    return { lines: parseLyrics(raw), hasRights: l?.hasRights !== false };
  }

  // Строки вида «[01:23.45] ...». Считаем текст синхронным, только если
  // таймкоды есть хотя бы у двух строк.
  function parseLyrics(raw) {
    const out = [];
    let timed = 0;
    raw.split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/);
      if (m) {
        const ms = (+m[1] * 60 + +m[2]) * 1000 + (m[3] ? +String(m[3]).padEnd(3, '0') : 0);
        out.push({ time: ms, text: m[4].trim() });
        timed++;
      } else {
        out.push({ time: null, text: line.trim() });
      }
    });
    return { items: out, synced: timed >= 2 };
  }

  function openLyricsSheet(track) {
    if (!track) return;
    const h = openSheetEl('lyrics-sheet');
    h.sheet.insertAdjacentHTML('beforeend', `
      <div class="sheet-title">
        ${escape(track.title)}
        <div class="sheet-subtitle">${escape(track.artists.join(', '))}</div>
      </div>
      <div class="lyrics-body" id="lyrics-body">
        ${'<div class="skeleton lyrics-skeleton"></div>'.repeat(5)}
      </div>
      <div class="lyrics-note" id="lyrics-note"></div>`);

    const body = h.sheet.querySelector('#lyrics-body');
    const note = h.sheet.querySelector('#lyrics-note');
    let shownTrackId = null;
    let lineEls = [];
    let parsed = null;
    let activeIdx = -1;

    const paint = async (t) => {
      shownTrackId = t.id;
      lineEls = []; parsed = null; activeIdx = -1;
      body.className = 'lyrics-body';
      body.innerHTML = '<div class="skeleton lyrics-skeleton"></div>'.repeat(5);
      note.textContent = '';

      let data = lyricsCache.get(t.id);
      if (data === undefined) {
        try { data = await loadLyrics(t.id); } catch { data = null; }
        lyricsCache.set(t.id, data);
      }
      if (shownTrackId !== t.id || !body.isConnected) return;

      if (!data) {
        body.innerHTML = '<div class="lyrics-empty">Для этого трека текста нет.</div>';
        return;
      }
      parsed = data.lines;
      body.classList.add(parsed.synced ? 'synced' : 'plain');
      body.innerHTML = '';
      parsed.items.forEach(item => {
        const p = document.createElement('p');
        p.className = 'lyrics-line';
        p.textContent = item.text;
        body.appendChild(p);
        lineEls.push(p);
      });
      note.textContent = parsed.synced
        ? 'Караоке: строка заливается в такт треку'
        : 'У этого текста нет таймкодов — показан целиком';
    };

    // Время начала следующей размеченной строки: им ограничена заливка текущей.
    const nextTime = (i) => {
      for (let j = i + 1; j < parsed.items.length; j++) {
        if (parsed.items[j].time !== null) return parsed.items[j].time;
      }
      return isFinite(audio?.duration) && audio.duration
        ? audio.duration * 1000
        : parsed.items[i].time + 4000;
    };

    // requestAnimationFrame, а не таймер: заливка строки должна идти плавно, а
    // не рывками. Слушатель на <audio> тут не годится — элемент пересоздаётся
    // на каждом треке, и подписка протухла бы после первого переключения.
    let raf = 0;
    let lastTrackCheck = 0;

    const frame = (now) => {
      raf = requestAnimationFrame(frame);

      if (now - lastTrackCheck > 400) {
        lastTrackCheck = now;
        const cur = queue[currentIndex];
        if (cur && cur.id !== shownTrackId) { paint(cur); return; }
      }
      if (!parsed?.synced || !audio || !isFinite(audio.currentTime)) return;

      const ms = audio.currentTime * 1000;
      const items = parsed.items;
      let idx = -1;
      for (let i = 0; i < items.length; i++) {
        if (items[i].time === null) continue;
        if (items[i].time <= ms) idx = i; else break;
      }

      if (idx !== activeIdx) {
        const prev = lineEls[activeIdx];
        if (prev) { prev.classList.remove('active'); prev.classList.add('past'); prev.style.removeProperty('--k'); }
        activeIdx = idx;
        const el = lineEls[activeIdx];
        if (el) {
          el.classList.add('active'); el.classList.remove('past');
          body.scrollTo({ top: el.offsetTop - body.clientHeight * 0.4, behavior: 'smooth' });
        }
      }

      const el = lineEls[activeIdx];
      if (!el) return;
      const start = items[activeIdx].time;
      const end = nextTime(activeIdx);
      const k = end > start ? Math.min(1, Math.max(0, (ms - start) / (end - start))) : 1;
      el.style.setProperty('--k', k.toFixed(4));
    };

    raf = requestAnimationFrame(frame);
    h.onClose(() => cancelAnimationFrame(raf));
    paint(track);
  }

  // ---------- Dynamic artwork colors ----------
  // Обложка → доминантный цвет → CSS-переменные. В дизайн-системе нет
  // зашитого акцента: --accent-dynamic, --accent-ink и фоновые --art-1/--art-2
  // пересчитываются на каждом треке, и от них красится весь интерфейс —
  // кнопки, прогресс, фон контента, «аура» My Vibe и карточка волны.
  const paletteCache = new Map();
  const ACCENT_VARS = ['--accent-dynamic', '--accent-ink', '--accent-soft', '--art-1', '--art-2', '--art-wave'];
  let paletteToken = 0;

  async function applyDynamicAccent(coverUrl) {
    if (!coverUrl) return resetDynamicAccent();
    const my = ++paletteToken;
    let pal = paletteCache.get(coverUrl);
    if (pal === undefined) {
      try { pal = await extractPalette(coverUrl); } catch { pal = null; }
      paletteCache.set(coverUrl, pal);
    }
    if (my !== paletteToken) return;          // трек успел смениться
    if (!pal) return resetDynamicAccent();
    const root = document.documentElement.style;
    root.setProperty('--accent-dynamic', pal.accent);
    root.setProperty('--accent-ink', pal.ink);
    root.setProperty('--accent-soft', pal.soft);
    root.setProperty('--art-1', pal.art1);
    root.setProperty('--art-2', pal.art2);
    root.setProperty('--art-wave', pal.wave);
  }

  function resetDynamicAccent() {
    paletteToken++;
    const root = document.documentElement.style;
    ACCENT_VARS.forEach(v => root.removeProperty(v));
  }

  async function extractPalette(url) {
    const img = await loadCoverImage(url);
    const N = 48;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, N, N);
    const { data } = ctx.getImageData(0, 0, N, N);

    // Бакеты по HSL. Побеждает не самый частый цвет, а самый «звучащий»:
    // вес = частота × насыщенность × близость яркости к середине. Иначе
    // акцентом почти всегда становится чёрный или белый фон обложки.
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      if (l < 0.12 || l > 0.95) continue;
      const key = `${Math.round(h * 12)}|${Math.round(s * 3)}|${Math.round(l * 4)}`;
      const b = buckets.get(key) || { h: 0, s: 0, l: 0, n: 0 };
      b.h += h; b.s += s; b.l += l; b.n++;
      buckets.set(key, b);
    }
    if (!buckets.size) return null;

    let best = null, bestScore = -1;
    for (const b of buckets.values()) {
      const s = b.s / b.n, l = b.l / b.n;
      const score = b.n * (0.35 + s) * (1 - Math.abs(l - 0.5));
      if (score > bestScore) { bestScore = score; best = { h: b.h / b.n, s, l }; }
    }

    // Приводим к читаемому диапазону: акцент должен работать и как фон кнопки.
    const h = best.h;
    const s = Math.min(0.92, Math.max(0.42, best.s));
    const l = Math.min(0.72, Math.max(0.56, best.l));
    const accent = hslToHex(h, s, l);
    return {
      accent,
      ink: pickInk(h, s, l),
      soft: hslToCss(h, s, l, 0.18),
      art1: hslToHex(h, s * 0.55, 0.21),
      art2: hslToHex(h, s * 0.4, 0.1),
      wave: hslToHex(h, Math.max(0.6, s), 0.5),
    };
  }

  function loadCoverImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      // Без CORS-заголовков canvas будет «испорчен» — тогда тянем байты через
      // прокси SDK и читаем картинку из blob (blob всегда same-origin).
      img.onerror = () => {
        sdk.fetch(url, { responseType: 'arraybuffer' }).then(r => {
          if (!r || !r.base64) return reject(new Error('cover fetch failed'));
          const bytes = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0));
          const blobUrl = URL.createObjectURL(new Blob([bytes]));
          const proxied = new Image();
          proxied.onload = () => { URL.revokeObjectURL(blobUrl); resolve(proxied); };
          proxied.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('cover decode failed')); };
          proxied.src = blobUrl;
        }).catch(reject);
      };
      img.src = url;
    });
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const ch = (t) => {
      t = (t + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [ch(h + 1 / 3), ch(h), ch(h - 1 / 3)].map(v => Math.round(v * 255));
  }

  function hslToHex(h, s, l) {
    return '#' + hslToRgb(h, s, l).map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function hslToCss(h, s, l, a) {
    const [r, g, b] = hslToRgb(h, s, l);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  // Текст на акцентной плашке: чёрный или белый — что контрастнее.
  function pickInk(h, s, l) {
    const [r, g, b] = hslToRgb(h, s, l);
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return (lum + 0.05) / 0.05 >= 1.05 / (lum + 0.05) ? '#000000' : '#ffffff';
  }

  // ---------- Utils ----------

  function fmtMs(ms) { return fmtSec(ms / 1000); }
  function fmtSec(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function escape(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function randomHex(n) {
    const bytes = new Uint8Array(n);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }
  async function md5(str) {
    // Web Crypto doesn't support MD5; embed a tiny pure-JS impl.
    return md5js(str);
  }
  // -- Tiny MD5 (RFC 1321) implementation --
  function md5js(s) {
    function L(k, d) { return (k << d) | (k >>> (32 - d)) }
    function K(G, k) { var I, d, F, H, x; F = (G & 2147483648); H = (k & 2147483648); I = (G & 1073741824); d = (k & 1073741824); x = (G & 1073741823) + (k & 1073741823); if (I & d) return (x ^ 2147483648 ^ F ^ H); if (I | d) { if (x & 1073741824) return (x ^ 3221225472 ^ F ^ H); else return (x ^ 1073741824 ^ F ^ H) } else return (x ^ F ^ H) }
    function r(d, F, k) { return (d & F) | ((~d) & k) }
    function q(d, F, k) { return (d & k) | (F & (~k)) }
    function p(d, F, k) { return (d ^ F ^ k) }
    function n(d, F, k) { return (F ^ (d | (~k))) }
    function u(G, F, aa, Z, k, H, I) { G = K(G, K(K(r(F, aa, Z), k), I)); return K(L(G, H), F) }
    function f(G, F, aa, Z, k, H, I) { G = K(G, K(K(q(F, aa, Z), k), I)); return K(L(G, H), F) }
    function D(G, F, aa, Z, k, H, I) { G = K(G, K(K(p(F, aa, Z), k), I)); return K(L(G, H), F) }
    function t(G, F, aa, Z, k, H, I) { G = K(G, K(K(n(F, aa, Z), k), I)); return K(L(G, H), F) }
    function e(G) { var Z, F = G.length, x = F + 8, k = (x - (x % 64)) / 64, I = (k + 1) * 16, aa = Array(I - 1), d = 0, H = 0; while (H < F) { Z = (H - (H % 4)) / 4; d = (H % 4) * 8; aa[Z] = (aa[Z] | (G.charCodeAt(H) << d)); H++ } Z = (H - (H % 4)) / 4; d = (H % 4) * 8; aa[Z] = aa[Z] | (128 << d); aa[I - 2] = F << 3; aa[I - 1] = F >>> 29; return aa }
    function B(x) { var k = "", F = "", G, d; for (d = 0; d <= 3; d++) { G = (x >>> (d * 8)) & 255; F = "0" + G.toString(16); k = k + F.substr(F.length - 2, 2) } return k }
    function J(k) { k = k.replace(/\r\n/g, "\n"); var d = ""; for (var F = 0; F < k.length; F++) { var x = k.charCodeAt(F); if (x < 128) { d += String.fromCharCode(x) } else if ((x > 127) && (x < 2048)) { d += String.fromCharCode((x >> 6) | 192); d += String.fromCharCode((x & 63) | 128) } else { d += String.fromCharCode((x >> 12) | 224); d += String.fromCharCode(((x >> 6) & 63) | 128); d += String.fromCharCode((x & 63) | 128) } } return d }
    var C = Array(), P, h, E, v, g, Y, M, X, W, o = 7, T = 12, R = 17, O = 22, A = 5, z = 9, y = 14, w = 20, N = 4, U = 11, S = 16, Q = 23, V = 6, b = 10, a = 15, c = 21; s = J(s); C = e(s); Y = 1732584193; M = 4023233417; X = 2562383102; W = 271733878;
    for (P = 0; P < C.length; P += 16) {
      h = Y; E = M; v = X; g = W; Y = u(Y, M, X, W, C[P + 0], o, 3614090360); W = u(W, Y, M, X, C[P + 1], T, 3905402710); X = u(X, W, Y, M, C[P + 2], R, 606105819); M = u(M, X, W, Y, C[P + 3], O, 3250441966); Y = u(Y, M, X, W, C[P + 4], o, 4118548399); W = u(W, Y, M, X, C[P + 5], T, 1200080426); X = u(X, W, Y, M, C[P + 6], R, 2821735955); M = u(M, X, W, Y, C[P + 7], O, 4249261313); Y = u(Y, M, X, W, C[P + 8], o, 1770035416); W = u(W, Y, M, X, C[P + 9], T, 2336552879); X = u(X, W, Y, M, C[P + 10], R, 4294925233); M = u(M, X, W, Y, C[P + 11], O, 2304563134); Y = u(Y, M, X, W, C[P + 12], o, 1804603682); W = u(W, Y, M, X, C[P + 13], T, 4254626195); X = u(X, W, Y, M, C[P + 14], R, 2792965006); M = u(M, X, W, Y, C[P + 15], O, 1236535329);
      Y = f(Y, M, X, W, C[P + 1], A, 4129170786); W = f(W, Y, M, X, C[P + 6], z, 3225465664); X = f(X, W, Y, M, C[P + 11], y, 643717713); M = f(M, X, W, Y, C[P + 0], w, 3921069994); Y = f(Y, M, X, W, C[P + 5], A, 3593408605); W = f(W, Y, M, X, C[P + 10], z, 38016083); X = f(X, W, Y, M, C[P + 15], y, 3634488961); M = f(M, X, W, Y, C[P + 4], w, 3889429448); Y = f(Y, M, X, W, C[P + 9], A, 568446438); W = f(W, Y, M, X, C[P + 14], z, 3275163606); X = f(X, W, Y, M, C[P + 3], y, 4107603335); M = f(M, X, W, Y, C[P + 8], w, 1163531501); Y = f(Y, M, X, W, C[P + 13], A, 2850285829); W = f(W, Y, M, X, C[P + 2], z, 4243563512); X = f(X, W, Y, M, C[P + 7], y, 1735328473); M = f(M, X, W, Y, C[P + 12], w, 2368359562);
      Y = D(Y, M, X, W, C[P + 5], N, 4294588738); W = D(W, Y, M, X, C[P + 8], U, 2272392833); X = D(X, W, Y, M, C[P + 11], S, 1839030562); M = D(M, X, W, Y, C[P + 14], Q, 4259657740); Y = D(Y, M, X, W, C[P + 1], N, 2763975236); W = D(W, Y, M, X, C[P + 4], U, 1272893353); X = D(X, W, Y, M, C[P + 7], S, 4139469664); M = D(M, X, W, Y, C[P + 10], Q, 3200236656); Y = D(Y, M, X, W, C[P + 13], N, 681279174); W = D(W, Y, M, X, C[P + 0], U, 3936430074); X = D(X, W, Y, M, C[P + 3], S, 3572445317); M = D(M, X, W, Y, C[P + 6], Q, 76029189); Y = D(Y, M, X, W, C[P + 9], N, 3654602809); W = D(W, Y, M, X, C[P + 12], U, 3873151461); X = D(X, W, Y, M, C[P + 15], S, 530742520); M = D(M, X, W, Y, C[P + 2], Q, 3299628645);
      Y = t(Y, M, X, W, C[P + 0], V, 4096336452); W = t(W, Y, M, X, C[P + 7], b, 1126891415); X = t(X, W, Y, M, C[P + 14], a, 2878612391); M = t(M, X, W, Y, C[P + 5], c, 4237533241); Y = t(Y, M, X, W, C[P + 12], V, 1700485571); W = t(W, Y, M, X, C[P + 3], b, 2399980690); X = t(X, W, Y, M, C[P + 10], a, 4293915773); M = t(M, X, W, Y, C[P + 1], c, 2240044497); Y = t(Y, M, X, W, C[P + 8], V, 1873313359); W = t(W, Y, M, X, C[P + 15], b, 4264355552); X = t(X, W, Y, M, C[P + 6], a, 2734768916); M = t(M, X, W, Y, C[P + 13], c, 1309151649); Y = t(Y, M, X, W, C[P + 4], V, 4149444226); W = t(W, Y, M, X, C[P + 11], b, 3174756917); X = t(X, W, Y, M, C[P + 2], a, 718787259); M = t(M, X, W, Y, C[P + 9], c, 3951481745);
      Y = K(Y, h); M = K(M, E); X = K(X, v); W = K(W, g)
    }
    return (B(Y) + B(M) + B(X) + B(W)).toLowerCase()
  }
})();
