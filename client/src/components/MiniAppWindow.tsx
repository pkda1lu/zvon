import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { MiniApp } from '../types';
import { CloseIcon, MaximizeIcon, LayoutGridIcon, MonitorIcon } from './Icons';
import { useAuth } from '../contexts/AuthContext';
import { useVoice } from '../contexts/VoiceContext';
import { useSocket } from '../contexts/SocketContext';
import './MiniAppWindow.css';

interface MiniAppWindowProps {
    app: MiniApp;
    onClose: (appId: string) => void;
}

const MiniAppWindow: React.FC<MiniAppWindowProps> = ({ app, onClose }) => {
    const [position, setPosition] = useState({ x: 100 + Math.random() * 50, y: 100 + Math.random() * 50 });
    const [size, setSize] = useState({ width: 800, height: 600 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isBlocked, setIsBlocked] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const { user } = useAuth();
    const {
        activeChannelId,
        publishExternalAudioTrack, publishExternalVideoTrack, unpublishExternalAudioTrack,
    } = useVoice();
    const { socket } = useSocket();

    const getAbsoluteUrl = (url: string) => {
        if (!url) return '';
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        if (url.startsWith('/')) return url;
        return `https://${url}`;
    };
    const absoluteUrl = getAbsoluteUrl(app.url);

    // Track of publication sids we created for this app, to clean up on unmount.
    const publishedSidsRef = useRef<Set<string>>(new Set());
    // sessionId -> { channelId, audioSid, videoSid }
    const presencesRef = useRef<Map<string, { channelId: string; audioSid?: string; videoSid?: string }>>(new Map());

    /** Resolve the LiveKit-style channel id for the user's current voice context. */
    const currentVoiceChannelId = useCallback((): string | null => {
        // VoiceContext.activeChannelId is the server-voice channel id (raw). For DM
        // the active voice room is encoded as call-<dmId> on the LiveKit side, but
        // VoiceContext doesn't track DM call membership. We expose only server
        // voice for now; DM presence can be added later by surfacing dmCallId.
        if (activeChannelId) return 'channel-' + activeChannelId;
        return null;
    }, [activeChannelId]);

    // postMessage bridge
    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const isFromOurFrame = (source: MessageEventSource | null) =>
            source === iframe.contentWindow;

        const respond = (id: string, payload: any) => {
            try { iframe.contentWindow?.postMessage({ __zvon: true, id, ...payload }, '*'); } catch {}
        };

        const handler = async (e: MessageEvent) => {
            if (!isFromOurFrame(e.source)) return;
            const msg = e.data;
            if (!msg || typeof msg !== 'object' || !msg.__zvon || !msg.type || msg.id == null) return;

            const { id, type, payload } = msg;
            try {
                switch (type) {
                    case 'init':
                        respond(id, { ok: true, result: {
                            user: user ? { _id: String(user._id), username: user.username, avatar: user.avatar } : null,
                            app: { _id: app._id, name: app.name },
                            voiceChannelId: activeChannelId,
                        }});
                        break;

                    case 'getUser':
                        respond(id, { ok: true, result: user ? {
                            _id: String(user._id), username: user.username, avatar: user.avatar
                        } : null });
                        break;

                    case 'getVoiceChannel':
                        respond(id, { ok: true, result: { channelId: activeChannelId } });
                        break;

                    case 'storage.get': {
                        const r = await axios.get(`/api/miniapps/${app._id}/storage/${encodeURIComponent(payload.key)}`);
                        respond(id, { ok: true, result: r.data.value });
                        break;
                    }
                    case 'storage.getAll': {
                        const r = await axios.get(`/api/miniapps/${app._id}/storage`);
                        respond(id, { ok: true, result: r.data });
                        break;
                    }
                    case 'storage.set': {
                        await axios.put(`/api/miniapps/${app._id}/storage/${encodeURIComponent(payload.key)}`, { value: payload.value });
                        respond(id, { ok: true, result: true });
                        break;
                    }
                    case 'storage.delete': {
                        await axios.delete(`/api/miniapps/${app._id}/storage/${encodeURIComponent(payload.key)}`);
                        respond(id, { ok: true, result: true });
                        break;
                    }

                    case 'fetch': {
                        const r = await axios.post(`/api/miniapps/${app._id}/fetch`, payload);
                        respond(id, { ok: true, result: r.data });
                        break;
                    }

                    case 'publishAudioTrack': {
                        const track = (msg as any).track as MediaStreamTrack | undefined;
                        if (!track) { respond(id, { ok: false, error: 'no track in transferable' }); break; }
                        const sid = await publishExternalAudioTrack(track, payload?.name || app.name);
                        if (sid) publishedSidsRef.current.add(sid);
                        respond(id, { ok: !!sid, result: sid });
                        break;
                    }

                    case 'unpublishAudioTrack': {
                        const sid = payload?.sid;
                        if (sid && publishedSidsRef.current.has(sid)) {
                            await unpublishExternalAudioTrack(sid);
                            publishedSidsRef.current.delete(sid);
                        }
                        respond(id, { ok: true });
                        break;
                    }

                    case 'sendMessage': {
                        if (!socket) { respond(id, { ok: false, error: 'no socket' }); break; }
                        socket.emit('send-message', payload);
                        respond(id, { ok: true });
                        break;
                    }

                    case 'voicePresence.create': {
                        const { sessionId, displayName, avatar } = payload;
                        const channelId = currentVoiceChannelId();
                        if (!channelId) { respond(id, { ok: false, error: 'Не в голосовом канале' }); break; }
                        if (!socket) { respond(id, { ok: false, error: 'no socket' }); break; }
                        socket.emit('voice-presence-create', { sessionId, channelId, displayName, avatar });
                        presencesRef.current.set(sessionId, { channelId });
                        respond(id, { ok: true, result: channelId });
                        break;
                    }
                    case 'voicePresence.publishAudio': {
                        const { sessionId } = payload;
                        const track = (msg as any).track as MediaStreamTrack | undefined;
                        const slot = presencesRef.current.get(sessionId);
                        if (!track || !slot) { respond(id, { ok: false, error: 'invalid' }); break; }
                        if (slot.audioSid) await unpublishExternalAudioTrack(slot.audioSid);
                        const sid = await publishExternalAudioTrack(track, 'zvon-presence:' + sessionId);
                        if (sid) { slot.audioSid = sid; publishedSidsRef.current.add(sid); }
                        respond(id, { ok: !!sid, result: sid });
                        break;
                    }
                    case 'voicePresence.publishVideo': {
                        const { sessionId } = payload;
                        const track = (msg as any).track as MediaStreamTrack | undefined;
                        const slot = presencesRef.current.get(sessionId);
                        if (!track || !slot) { respond(id, { ok: false, error: 'invalid' }); break; }
                        if (slot.videoSid) await unpublishExternalAudioTrack(slot.videoSid);
                        const sid = await publishExternalVideoTrack(track, 'zvon-presence:' + sessionId);
                        if (sid) { slot.videoSid = sid; publishedSidsRef.current.add(sid); }
                        respond(id, { ok: !!sid, result: sid });
                        break;
                    }
                    case 'voicePresence.unpublishAudio': {
                        const slot = presencesRef.current.get(payload.sessionId);
                        if (slot?.audioSid) {
                            await unpublishExternalAudioTrack(slot.audioSid);
                            publishedSidsRef.current.delete(slot.audioSid);
                            slot.audioSid = undefined;
                        }
                        respond(id, { ok: true });
                        break;
                    }
                    case 'voicePresence.unpublishVideo': {
                        const slot = presencesRef.current.get(payload.sessionId);
                        if (slot?.videoSid) {
                            await unpublishExternalAudioTrack(slot.videoSid);
                            publishedSidsRef.current.delete(slot.videoSid);
                            slot.videoSid = undefined;
                        }
                        respond(id, { ok: true });
                        break;
                    }
                    case 'voicePresence.setBackground': {
                        const slot = presencesRef.current.get(payload.sessionId);
                        if (!slot || !socket) { respond(id, { ok: false, error: 'invalid' }); break; }
                        socket.emit('voice-presence-update', { sessionId: payload.sessionId, channelId: slot.channelId, patch: { background: payload.background } });
                        respond(id, { ok: true });
                        break;
                    }
                    case 'voicePresence.setControls': {
                        const slot = presencesRef.current.get(payload.sessionId);
                        if (!slot || !socket) { respond(id, { ok: false, error: 'invalid' }); break; }
                        socket.emit('voice-presence-update', { sessionId: payload.sessionId, channelId: slot.channelId, patch: { controls: payload.controls } });
                        respond(id, { ok: true });
                        break;
                    }
                    case 'voicePresence.updateControl': {
                        const slot = presencesRef.current.get(payload.sessionId);
                        if (!slot || !socket) { respond(id, { ok: false, error: 'invalid' }); break; }
                        socket.emit('voice-presence-update', { sessionId: payload.sessionId, channelId: slot.channelId, patch: { controlPatch: { id: payload.controlId, partial: payload.partial } } });
                        respond(id, { ok: true });
                        break;
                    }
                    case 'voicePresence.destroy': {
                        const slot = presencesRef.current.get(payload.sessionId);
                        if (slot) {
                            if (slot.audioSid) { await unpublishExternalAudioTrack(slot.audioSid); publishedSidsRef.current.delete(slot.audioSid); }
                            if (slot.videoSid) { await unpublishExternalAudioTrack(slot.videoSid); publishedSidsRef.current.delete(slot.videoSid); }
                            if (socket) socket.emit('voice-presence-destroy', { sessionId: payload.sessionId, channelId: slot.channelId });
                            presencesRef.current.delete(payload.sessionId);
                        }
                        respond(id, { ok: true });
                        break;
                    }

                    case 'oauthPopup': {
                        // Open OAuth in a popup. Resolves when popup navigates to a URL
                        // that matches the supplied redirect_uri (substring match). The
                        // OAuth flow passes through several intermediate URLs (login pages,
                        // consent screens), all of which we must IGNORE — only the final
                        // redirect back to the app is meaningful.
                        const win = window.open(payload.url, 'zvon-oauth', `width=${payload.width||600},height=${payload.height||720}`);
                        if (!win) { respond(id, { ok: false, error: 'popup blocked' }); break; }
                        const expected = payload.redirectUri ? String(payload.redirectUri) : null;
                        const start = Date.now();
                        const poll = setInterval(() => {
                            try {
                                if (win.closed) { clearInterval(poll); respond(id, { ok: false, error: 'closed' }); return; }
                                const href = win.location.href;
                                if (!href || href === 'about:blank') return;
                                // Strict gate: must look like our redirect (or at least same-origin to host)
                                const isOurRedirect = expected
                                    ? href.startsWith(expected.split('#')[0].split('?')[0])
                                    : href.startsWith(window.location.origin);
                                if (!isOurRedirect) return;
                                const url = new URL(href);
                                clearInterval(poll);
                                try { win.close(); } catch {}
                                respond(id, { ok: true, result: { href, hash: url.hash, search: url.search } });
                            } catch {
                                // Cross-origin — keep polling silently
                            }
                            if (Date.now() - start > 300000) { clearInterval(poll); try { win.close(); } catch {}; respond(id, { ok: false, error: 'timeout' }); }
                        }, 400);
                        break;
                    }

                    default:
                        respond(id, { ok: false, error: 'unknown type: ' + type });
                }
            } catch (err: any) {
                respond(id, { ok: false, error: err?.response?.data?.message || err?.message || 'error' });
            }
        };

        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [user, app._id, app.name, activeChannelId, publishExternalAudioTrack, unpublishExternalAudioTrack, socket]);

    // Broadcast voice channel changes to the iframe
    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        try {
            iframe.contentWindow?.postMessage({ __zvon: true, event: 'voiceChannelChanged', payload: { channelId: activeChannelId } }, '*');
        } catch {}
    }, [activeChannelId]);

    // Forward voice-presence-control events from the host socket to the iframe,
    // but only when the targeted session is owned by THIS iframe.
    useEffect(() => {
        if (!socket) return;
        const onControl = (data: { sessionId: string; channelId: string; controlId: string; value?: any; fromUserId: string }) => {
            if (!presencesRef.current.has(data.sessionId)) return;
            const iframe = iframeRef.current;
            try { iframe?.contentWindow?.postMessage({ __zvon: true, event: 'voicePresenceControl', payload: data }, '*'); } catch {}
        };
        socket.on('voice-presence-control', onControl);
        return () => { socket.off('voice-presence-control', onControl); };
    }, [socket]);

    // Cleanup any published tracks and presences on unmount
    useEffect(() => {
        return () => {
            for (const sid of publishedSidsRef.current) {
                unpublishExternalAudioTrack(sid).catch(() => {});
            }
            publishedSidsRef.current.clear();
            for (const [sessionId, slot] of presencesRef.current.entries()) {
                if (socket) socket.emit('voice-presence-destroy', { sessionId, channelId: slot.channelId });
            }
            presencesRef.current.clear();
        };
    }, [unpublishExternalAudioTrack, socket]);

    useEffect(() => {
        const timer = setTimeout(() => { if (isLoading) setIsBlocked(true); }, 7000);
        return () => clearTimeout(timer);
    }, [isLoading]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    };
    const handleResizeDown = (e: React.MouseEvent, direction: string) => {
        e.stopPropagation();
        setIsResizing(direction);
        resizeStartRef.current = { x: e.clientX, y: e.clientY, w: size.width, h: size.height };
    };
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDragging) {
            setPosition({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
        } else if (isResizing) {
            const dx = e.clientX - resizeStartRef.current.x;
            const dy = e.clientY - resizeStartRef.current.y;
            let newW = resizeStartRef.current.w;
            let newH = resizeStartRef.current.h;
            if (isResizing.includes('right')) newW = Math.max(400, resizeStartRef.current.w + dx);
            if (isResizing.includes('bottom')) newH = Math.max(300, resizeStartRef.current.h + dy);
            setSize({ width: newW, height: newH });
        }
    }, [isDragging, isResizing]);
    const handleMouseUp = useCallback(() => { setIsDragging(false); setIsResizing(null); }, []);

    useEffect(() => {
        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

    return (
        <div
            className="miniapp-window"
            style={{ left: position.x, top: position.y, width: size.width, height: size.height, zIndex: isDragging || isResizing ? 9001 : 9000 }}
        >
            <div className="miniapp-header" onMouseDown={handleMouseDown}>
                <div className="header-info">
                    <LayoutGridIcon size={16} color="var(--primary-neon)" />
                    <span>{app.name}</span>
                </div>
                <div className="header-actions">
                    <a href={absoluteUrl} target="_blank" rel="noopener noreferrer" className="header-btn" title="Открыть в новой вкладке" onMouseDown={e => e.stopPropagation()}>
                        <MaximizeIcon size={16} />
                    </a>
                    <button className="header-btn" onClick={() => onClose(app._id)} onMouseDown={e => e.stopPropagation()}>
                        <CloseIcon size={18} />
                    </button>
                </div>
            </div>
            <div className="miniapp-content" style={{ position: 'relative' }}>
                {isBlocked && (
                    <div className="miniapp-blocked-overlay">
                        <div className="blocked-content">
                            <MonitorIcon size={64} color="var(--text-dim)" />
                            <h3>Сайт не загружается?</h3>
                            <p>Многие современные сайты (Google, GitHub и др.) запрещают встраивание во фреймы в целях безопасности.</p>
                            <a href={absoluteUrl} target="_blank" rel="noopener noreferrer" className="neon-btn" style={{ padding: '12px 24px', fontSize: '13px' }}>
                                Открыть в новой вкладке
                            </a>
                        </div>
                    </div>
                )}
                {isLoading && !isBlocked && (
                    <div className="miniapp-loading">
                        <div className="loading-spinner-rings"><div></div><div></div><div></div><div></div></div>
                    </div>
                )}
                <iframe
                    ref={iframeRef}
                    src={absoluteUrl}
                    title={app.name}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    onLoad={() => { setIsLoading(false); setIsBlocked(false); }}
                    allow="geolocation; microphone; camera; midi; vr; accelerometer; gyroscope; payment; ambient-light-sensor; encrypted-media; usb; autoplay"
                    style={{ pointerEvents: isDragging || isResizing ? 'none' : 'auto', background: 'white', display: isBlocked ? 'none' : 'block' }}
                />
            </div>
            <div className="resize-handle right" onMouseDown={(e) => handleResizeDown(e, 'right')} />
            <div className="resize-handle bottom" onMouseDown={(e) => handleResizeDown(e, 'bottom')} />
            <div className="resize-handle bottom-right" onMouseDown={(e) => handleResizeDown(e, 'bottom-right')} />
        </div>
    );
};

export default MiniAppWindow;
