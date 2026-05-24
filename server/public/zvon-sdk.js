// Zvon Mini-App SDK
// Available as `window.zvon` inside a mini-app iframe loaded by the Zvon client.
// Communication runs over postMessage between the iframe and the host window.
(function () {
  if (window.zvon) return;

  const HOST = window.parent;
  const callbacks = new Map();
  const eventHandlers = new Map();
  let _seq = 0;

  function nextId() { return 'm_' + (++_seq) + '_' + Date.now(); }

  function call(type, payload, extra, transfer) {
    return new Promise((resolve, reject) => {
      const id = nextId();
      callbacks.set(id, { resolve, reject });
      try {
        HOST.postMessage({ __zvon: true, id, type, payload, ...(extra || {}) }, '*', transfer || []);
      } catch (e) {
        callbacks.delete(id);
        reject(e);
      }
    });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== HOST) return;
    const msg = e.data;
    if (!msg || !msg.__zvon) return;

    if (msg.id != null && callbacks.has(msg.id)) {
      const { resolve, reject } = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      if (msg.ok) resolve(msg.result);
      else reject(new Error(msg.error || 'mini-app SDK error'));
      return;
    }
    if (msg.event) {
      const handlers = eventHandlers.get(msg.event) || [];
      handlers.forEach(h => { try { h(msg.payload); } catch (err) { console.error(err); } });
    }
  });

  const storage = {
    get: (key) => call('storage.get', { key }),
    set: (key, value) => call('storage.set', { key, value }),
    delete: (key) => call('storage.delete', { key }),
    getAll: () => call('storage.getAll', {}),
  };

  const zvon = {
    version: 1,

    /** Initial handshake. Returns { user, app, voiceChannelId }. Call this first. */
    init: () => call('init', {}),

    /** Current Zvon user info. */
    getUser: () => call('getUser', {}),

    /** Current active voice channel of the user (null if not in voice). */
    getVoiceChannel: () => call('getVoiceChannel', {}),

    /**
     * Publish a MediaStreamTrack into the user's voice channel so other members hear it.
     * Returns the LiveKit publication sid (string) — keep it to unpublish later.
     * The user must be in a voice channel.
     */
    publishAudioTrack: async (track) => {
      if (!(track instanceof MediaStreamTrack) || track.kind !== 'audio') {
        throw new Error('publishAudioTrack expects an audio MediaStreamTrack');
      }
      // The MediaStreamTrack rides along the message AND is in the transferable list,
      // so ownership moves to the parent window.
      return call('publishAudioTrack', { name: 'miniapp-audio' }, { track }, [track]);
    },

    /** Stop publishing a previously published track by sid. */
    unpublishAudioTrack: (sid) => call('unpublishAudioTrack', { sid }),

    /**
     * Make an HTTP request via the Zvon server (bypasses CORS). Use this when calling
     * third-party APIs that don't allow direct browser access.
     * options: { method, headers, body, responseType: 'json'|'text'|'arraybuffer', timeout }
     */
    fetch: (url, options) => call('fetch', { url, ...(options || {}) }),

    /** Send a chat message into a Zvon channel as the current user. */
    sendMessage: (channelId, payload) => call('sendMessage', { channelId, ...payload }),

    /**
     * Open an OAuth popup. Resolves with { href, hash, search } once the popup
     * navigates to your `redirectUri` (substring match on origin + path).
     * Pass redirectUri explicitly so the bridge can ignore intermediate auth
     * pages (login screens, consent prompts) that occur during the flow.
     */
    oauthPopup: (url, options) => {
      let redirectUri = options && options.redirectUri;
      if (!redirectUri) {
        try {
          const u = new URL(url);
          redirectUri = u.searchParams.get('redirect_uri') || undefined;
        } catch {}
      }
      return call('oauthPopup', { url, redirectUri, ...(options || {}) });
    },

    /** Per-user, per-app key-value storage (server-backed, persists across sessions). */
    storage,

    /** Subscribe to host events. Returns an unsubscribe function. */
    on: (event, handler) => {
      const list = eventHandlers.get(event) || [];
      list.push(handler);
      eventHandlers.set(event, list);
      return () => {
        const cur = eventHandlers.get(event) || [];
        eventHandlers.set(event, cur.filter(h => h !== handler));
      };
    },
  };

  window.zvon = zvon;
  // Fire a custom event when SDK is ready
  window.dispatchEvent(new CustomEvent('zvon-sdk-ready'));
})();
