import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { User } from '../types';
import { normalizeServerFolders, ServerFolder } from './serverFolders';

function readCache(user: User) {
  try {
    const cached = JSON.parse(localStorage.getItem(`zvon:server-folders:${user._id}`) || 'null');
    return { folders: normalizeServerFolders(Array.isArray(cached) ? cached : cached?.folders), pending: Array.isArray(cached) || cached?.pending === true };
  } catch { return { folders: [], pending: false }; }
}

function readFolders(user: User) {
  const cached = readCache(user);
  if (cached.pending || user.settings?.serverFolders === undefined) return cached.folders;
  return normalizeServerFolders(user.settings.serverFolders);
}

export function useServerFolders(user: User) {
  const { updateUser } = useAuth();
  const [folders, setFolders] = useState(() => readFolders(user));
  const migration = useRef<AbortController | null>(null);
  const remote = JSON.stringify(user.settings?.serverFolders);
  useEffect(() => { setFolders(readFolders(user)); }, [user._id, remote]);

  // Preserve folders created against an older server when account sync arrives.
  useEffect(() => {
    const cached = readCache(user);
    if (!cached.pending || user.settings?.serverFolders === undefined) return;
    const controller = new AbortController();
    migration.current = controller;
    axios.put('/api/users/settings', { settings: { serverFolders: cached.folders } }, { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted || !Array.isArray(data.settings?.serverFolders)) return;
        localStorage.setItem(`zvon:server-folders:${user._id}`, JSON.stringify({ folders: cached.folders, pending: false }));
        updateUser({ settings: data.settings });
      }).catch(() => { /* Keep the account-scoped local copy for the next save. */ });
    return () => controller.abort();
  }, [user._id, remote]);

  const saveFolders = async (next: ServerFolder[]) => {
    migration.current?.abort();
    const normalized = normalizeServerFolders(next);
    if (user.settings?.serverFolders !== undefined) {
      const { data } = await axios.put('/api/users/settings', { settings: { serverFolders: normalized } });
      if (!Array.isArray(data.settings?.serverFolders)) throw new Error('Server did not save folders');
      updateUser({ settings: data.settings });
    }
    // Account-scoped cache also supports clients connected to an older server.
    try { localStorage.setItem(`zvon:server-folders:${user._id}`, JSON.stringify({ folders: normalized, pending: user.settings?.serverFolders === undefined })); }
    catch (error) { if (user.settings?.serverFolders === undefined) throw error; }
    setFolders(normalized);
  };
  return { folders, saveFolders, synced: user.settings?.serverFolders !== undefined };
}
