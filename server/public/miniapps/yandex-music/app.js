// Yandex Music mini-app for Zvon — reference implementation of the Zvon Mini-App SDK.
// All Yandex API calls go through zvon.fetch (server proxy, bypasses CORS).
// Audio is played via an <audio> element, captured with captureStream() and
// published into the user's voice channel via zvon.publishAudioTrack().

(async function () {
  // The mini-app developer registers an OAuth client at https://oauth.yandex.ru/
  // with redirect URI = the absolute URL of oauth-callback.html in this folder.
  // The client_id is public; replace with yours.
  const YANDEX_CLIENT_ID = window.YM_CLIENT_ID || '23cabbbae6534cfe9d50f3c7a5b97041';

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
  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';
  let captureStream = null;
  let publishedSid = null;
  let queue = [];
  let currentIndex = -1;

  audio.addEventListener('ended', () => { if (currentIndex < queue.length - 1) playIndex(currentIndex + 1); else stopPlayback(); });
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('play', () => { $('#btn-play').textContent = '⏸'; });
  audio.addEventListener('pause', () => { $('#btn-play').textContent = '▶'; });

  $('#vol').addEventListener('input', (e) => { audio.volume = Number(e.target.value) / 100; });
  audio.volume = 0.8;

  $('#btn-play').addEventListener('click', () => { audio.paused ? audio.play() : audio.pause(); });
  $('#btn-prev').addEventListener('click', () => { if (currentIndex > 0) playIndex(currentIndex - 1); });
  $('#btn-next').addEventListener('click', () => { if (currentIndex < queue.length - 1) playIndex(currentIndex + 1); });
  $('#btn-stop').addEventListener('click', stopPlayback);

  sdk.on('voiceChannelChanged', (p) => {
    // If user leaves voice while we are streaming, drop the published track.
    if (!p.channelId && publishedSid) {
      sdk.unpublishAudioTrack(publishedSid).catch(() => {});
      publishedSid = null;
    }
  });

  renderAccount();
  if (!token) renderConnectScreen();
  else renderSearchScreen();

  // ---------- UI screens ----------

  function showFatal(text) {
    main.innerHTML = `<div class="banner error">${escape(text)}</div>`;
  }

  function renderAccount() {
    if (token && ymAccount) {
      account.innerHTML = `<span class="login">${escape(ymAccount.login || '')}</span>` +
        (ymAccount.hasPlus ? '<span title="Plus активна">⭐</span>' : '') +
        '<button id="logout">Выйти</button>';
      $('#logout').addEventListener('click', async () => {
        await sdk.storage.delete('access_token');
        await sdk.storage.delete('account');
        token = null; ymAccount = null;
        renderAccount();
        renderConnectScreen();
      });
    } else {
      account.innerHTML = '';
    }
  }

  function renderConnectScreen() {
    main.innerHTML = `
      <div class="connect-screen">
        <h2>Подключи аккаунт Яндекс Музыки</h2>
        <p>Чтобы слушать музыку вместе с друзьями в голосовом канале, авторизуйся через Яндекс ID. Токен хранится только в твоём профиле Zvon.</p>
        <button class="connect-btn" id="connect-btn">Войти через Яндекс</button>
      </div>`;
    $('#connect-btn').addEventListener('click', connectYandex);
  }

  async function connectYandex() {
    const redirectUri = new URL('./oauth-callback.html', window.location.href).toString();
    const url = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${encodeURIComponent(YANDEX_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&force_confirm=yes`;
    try {
      const r = await sdk.oauthPopup(url, { width: 600, height: 720 });
      // r.hash like "#access_token=...&token_type=bearer&expires_in=..."
      const params = new URLSearchParams((r.hash || '').replace(/^#/, ''));
      const accessToken = params.get('access_token');
      if (!accessToken) throw new Error('Токен не получен');
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
      renderAccount();
      renderSearchScreen();
    } catch (e) {
      alert('Ошибка авторизации: ' + e.message);
    }
  }

  function renderSearchScreen() {
    const noVoice = !init.voiceChannelId;
    main.innerHTML = `
      ${noVoice ? '<div class="banner warn">Зайди в голосовой канал, чтобы транслировать музыку другим. Без канала проигрывание будет только у тебя.</div>' : ''}
      <div class="search-box">
        <input id="q" placeholder="Поиск трека, исполнителя…" autocomplete="off" />
        <button id="search-btn">Найти</button>
      </div>
      <div class="section-title">Очередь</div>
      <div id="queue" class="queue empty-or-list"></div>
      <div class="section-title">Результаты</div>
      <div id="results" class="track-list"></div>
    `;
    renderQueue();
    const q = $('#q');
    q.focus();
    let searchTimer = null;
    q.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => doSearch(q.value), 400); });
    $('#search-btn').addEventListener('click', () => doSearch(q.value));
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(q.value); });
  }

  async function doSearch(query) {
    query = (query || '').trim();
    const results = $('#results');
    if (!query) { results.innerHTML = ''; return; }
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

  function renderQueue() {
    const el = $('#queue');
    if (!queue.length) { el.innerHTML = '<div class="empty">Очередь пуста — добавь треки из результатов поиска</div>'; return; }
    el.innerHTML = '';
    queue.forEach((t, i) => el.appendChild(renderTrackRow(t, true, i)));
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
      const playBtn = document.createElement('button'); playBtn.textContent = '▶';
      playBtn.addEventListener('click', (e) => { e.stopPropagation(); playIndex(queueIndex); });
      const rmBtn = document.createElement('button'); rmBtn.textContent = '✕';
      rmBtn.addEventListener('click', (e) => { e.stopPropagation(); removeFromQueue(queueIndex); });
      actions.appendChild(playBtn); actions.appendChild(rmBtn);
      div.addEventListener('click', () => playIndex(queueIndex));
    } else {
      const playNow = document.createElement('button'); playNow.textContent = 'Играть';
      playNow.addEventListener('click', (e) => { e.stopPropagation(); addAndPlay(track); });
      const addBtn = document.createElement('button'); addBtn.textContent = '+ в очередь';
      addBtn.addEventListener('click', (e) => { e.stopPropagation(); addToQueue(track); });
      actions.appendChild(playNow); actions.appendChild(addBtn);
    }
    return div;
  }

  function normalizeTrack(t) {
    return {
      id: String(t.id).split(':')[0],
      title: t.title || '',
      artists: (t.artists || []).map(a => a.name),
      durationMs: t.durationMs || 0,
      coverUri: t.coverUri || t.albums?.[0]?.coverUri,
      albumId: t.albums?.[0]?.id,
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
    queue.push(track);
    renderQueue();
    await playIndex(queue.length - 1);
  }

  // ---------- Playback ----------

  async function playIndex(index) {
    if (index < 0 || index >= queue.length) return;
    currentIndex = index;
    renderQueue();
    const track = queue[index];
    showPlayer(track, true);

    let streamUrl;
    try { streamUrl = await resolveStreamUrl(track.id); }
    catch (e) { console.error('[YM] stream url failed:', e); showPlayer(track, false, 'Не удалось получить поток: ' + e.message); return; }

    try {
      // Fetch the audio bytes via proxy so the resulting Blob URL is same-origin
      // and captureStream() works without CORS issues.
      const r = await sdk.fetch(streamUrl, { responseType: 'arraybuffer', headers: { ...HEADERS_BASE } });
      if (r.status >= 400) throw new Error('HTTP ' + r.status);
      const bytes = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      audio.src = URL.createObjectURL(blob);
      await audio.play();
      showPlayer(track, false);
      await ensurePublished();
    } catch (e) {
      console.error('[YM] playback failed:', e);
      showPlayer(track, false, 'Ошибка проигрывания: ' + e.message);
    }
  }

  async function ensurePublished() {
    if (publishedSid) return;
    if (!init.voiceChannelId) return;
    if (typeof audio.captureStream !== 'function') {
      console.warn('[YM] captureStream not supported in this browser');
      return;
    }
    try {
      captureStream = audio.captureStream();
      const track = captureStream.getAudioTracks()[0];
      if (!track) return;
      publishedSid = await sdk.publishAudioTrack(track);
    } catch (e) {
      console.error('[YM] publishAudioTrack failed:', e);
    }
  }

  async function stopPlayback() {
    try { audio.pause(); } catch {}
    audio.removeAttribute('src');
    try { audio.load(); } catch {}
    currentIndex = -1;
    renderQueue();
    player.classList.add('hidden');
    if (publishedSid) {
      try { await sdk.unpublishAudioTrack(publishedSid); } catch {}
      publishedSid = null;
    }
  }

  function showPlayer(track, loading, errorMsg) {
    player.classList.remove('hidden');
    const cover = track.coverUri ? `https://${track.coverUri.replace('%%', '200x200')}` : '';
    $('#player-cover').style.backgroundImage = `url('${cover}')`;
    $('#player-title').innerHTML = (loading ? '<span class="spinner"></span> ' : '') + escape(track.title);
    $('#player-artist').textContent = errorMsg || track.artists.join(', ');
    $('#player-duration').textContent = fmtMs(track.durationMs);
    $('#player-elapsed').textContent = '0:00';
    $('#player-bar-fill').style.width = '0%';
  }

  function updateProgress() {
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
    const info = infos.find(i => i.codec === 'mp3' && !i.preview) || infos[0];
    const url = info.downloadInfoUrl + (info.downloadInfoUrl.includes('?') ? '&' : '?') + 'format=json';

    const dl = await sdk.fetch(url, { method: 'GET', headers, responseType: 'json' });
    if (dl.status >= 400 || !dl.data?.host) throw new Error('download-info failed (' + dl.status + ')');
    const { host, path, ts, s } = dl.data;
    const sign = await md5('XGRwNC9wZnduYm9n' + path.substring(1) + s);
    return `https://${host}/get-mp3/${sign}/${ts}${path}`;
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
    function L(k,d){return(k<<d)|(k>>>(32-d))}
    function K(G,k){var I,d,F,H,x;F=(G&2147483648);H=(k&2147483648);I=(G&1073741824);d=(k&1073741824);x=(G&1073741823)+(k&1073741823);if(I&d)return(x^2147483648^F^H);if(I|d){if(x&1073741824)return(x^3221225472^F^H);else return(x^1073741824^F^H)}else return(x^F^H)}
    function r(d,F,k){return(d&F)|((~d)&k)}
    function q(d,F,k){return(d&k)|(F&(~k))}
    function p(d,F,k){return(d^F^k)}
    function n(d,F,k){return(F^(d|(~k)))}
    function u(G,F,aa,Z,k,H,I){G=K(G,K(K(r(F,aa,Z),k),I));return K(L(G,H),F)}
    function f(G,F,aa,Z,k,H,I){G=K(G,K(K(q(F,aa,Z),k),I));return K(L(G,H),F)}
    function D(G,F,aa,Z,k,H,I){G=K(G,K(K(p(F,aa,Z),k),I));return K(L(G,H),F)}
    function t(G,F,aa,Z,k,H,I){G=K(G,K(K(n(F,aa,Z),k),I));return K(L(G,H),F)}
    function e(G){var Z,F=G.length,x=F+8,k=(x-(x%64))/64,I=(k+1)*16,aa=Array(I-1),d=0,H=0;while(H<F){Z=(H-(H%4))/4;d=(H%4)*8;aa[Z]=(aa[Z]|(G.charCodeAt(H)<<d));H++}Z=(H-(H%4))/4;d=(H%4)*8;aa[Z]=aa[Z]|(128<<d);aa[I-2]=F<<3;aa[I-1]=F>>>29;return aa}
    function B(x){var k="",F="",G,d;for(d=0;d<=3;d++){G=(x>>>(d*8))&255;F="0"+G.toString(16);k=k+F.substr(F.length-2,2)}return k}
    function J(k){k=k.replace(/\r\n/g,"\n");var d="";for(var F=0;F<k.length;F++){var x=k.charCodeAt(F);if(x<128){d+=String.fromCharCode(x)}else if((x>127)&&(x<2048)){d+=String.fromCharCode((x>>6)|192);d+=String.fromCharCode((x&63)|128)}else{d+=String.fromCharCode((x>>12)|224);d+=String.fromCharCode(((x>>6)&63)|128);d+=String.fromCharCode((x&63)|128)}}return d}
    var C=Array(),P,h,E,v,g,Y,M,X,W,o=7,T=12,R=17,O=22,A=5,z=9,y=14,w=20,N=4,U=11,S=16,Q=23,V=6,b=10,a=15,c=21;s=J(s);C=e(s);Y=1732584193;M=4023233417;X=2562383102;W=271733878;
    for(P=0;P<C.length;P+=16){h=Y;E=M;v=X;g=W;Y=u(Y,M,X,W,C[P+0],o,3614090360);W=u(W,Y,M,X,C[P+1],T,3905402710);X=u(X,W,Y,M,C[P+2],R,606105819);M=u(M,X,W,Y,C[P+3],O,3250441966);Y=u(Y,M,X,W,C[P+4],o,4118548399);W=u(W,Y,M,X,C[P+5],T,1200080426);X=u(X,W,Y,M,C[P+6],R,2821735955);M=u(M,X,W,Y,C[P+7],O,4249261313);Y=u(Y,M,X,W,C[P+8],o,1770035416);W=u(W,Y,M,X,C[P+9],T,2336552879);X=u(X,W,Y,M,C[P+10],R,4294925233);M=u(M,X,W,Y,C[P+11],O,2304563134);Y=u(Y,M,X,W,C[P+12],o,1804603682);W=u(W,Y,M,X,C[P+13],T,4254626195);X=u(X,W,Y,M,C[P+14],R,2792965006);M=u(M,X,W,Y,C[P+15],O,1236535329);
    Y=f(Y,M,X,W,C[P+1],A,4129170786);W=f(W,Y,M,X,C[P+6],z,3225465664);X=f(X,W,Y,M,C[P+11],y,643717713);M=f(M,X,W,Y,C[P+0],w,3921069994);Y=f(Y,M,X,W,C[P+5],A,3593408605);W=f(W,Y,M,X,C[P+10],z,38016083);X=f(X,W,Y,M,C[P+15],y,3634488961);M=f(M,X,W,Y,C[P+4],w,3889429448);Y=f(Y,M,X,W,C[P+9],A,568446438);W=f(W,Y,M,X,C[P+14],z,3275163606);X=f(X,W,Y,M,C[P+3],y,4107603335);M=f(M,X,W,Y,C[P+8],w,1163531501);Y=f(Y,M,X,W,C[P+13],A,2850285829);W=f(W,Y,M,X,C[P+2],z,4243563512);X=f(X,W,Y,M,C[P+7],y,1735328473);M=f(M,X,W,Y,C[P+12],w,2368359562);
    Y=D(Y,M,X,W,C[P+5],N,4294588738);W=D(W,Y,M,X,C[P+8],U,2272392833);X=D(X,W,Y,M,C[P+11],S,1839030562);M=D(M,X,W,Y,C[P+14],Q,4259657740);Y=D(Y,M,X,W,C[P+1],N,2763975236);W=D(W,Y,M,X,C[P+4],U,1272893353);X=D(X,W,Y,M,C[P+7],S,4139469664);M=D(M,X,W,Y,C[P+10],Q,3200236656);Y=D(Y,M,X,W,C[P+13],N,681279174);W=D(W,Y,M,X,C[P+0],U,3936430074);X=D(X,W,Y,M,C[P+3],S,3572445317);M=D(M,X,W,Y,C[P+6],Q,76029189);Y=D(Y,M,X,W,C[P+9],N,3654602809);W=D(W,Y,M,X,C[P+12],U,3873151461);X=D(X,W,Y,M,C[P+15],S,530742520);M=D(M,X,W,Y,C[P+2],Q,3299628645);
    Y=t(Y,M,X,W,C[P+0],V,4096336452);W=t(W,Y,M,X,C[P+7],b,1126891415);X=t(X,W,Y,M,C[P+14],a,2878612391);M=t(M,X,W,Y,C[P+5],c,4237533241);Y=t(Y,M,X,W,C[P+12],V,1700485571);W=t(W,Y,M,X,C[P+3],b,2399980690);X=t(X,W,Y,M,C[P+10],a,4293915773);M=t(M,X,W,Y,C[P+1],c,2240044497);Y=t(Y,M,X,W,C[P+8],V,1873313359);W=t(W,Y,M,X,C[P+15],b,4264355552);X=t(X,W,Y,M,C[P+6],a,2734768916);M=t(M,X,W,Y,C[P+13],c,1309151649);Y=t(Y,M,X,W,C[P+4],V,4149444226);W=t(W,Y,M,X,C[P+11],b,3174756917);X=t(X,W,Y,M,C[P+2],a,718787259);M=t(M,X,W,Y,C[P+9],c,3951481745);
    Y=K(Y,h);M=K(M,E);X=K(X,v);W=K(W,g)}
    return(B(Y)+B(M)+B(X)+B(W)).toLowerCase()
  }
})();
