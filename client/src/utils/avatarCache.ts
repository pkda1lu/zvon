import { useState, useEffect } from 'react';
import { getAvatarUrl } from './avatar';

const DB_NAME = 'zvon_avatar_cache_db';
const DB_VERSION = 1;
const AVATAR_STORE = 'avatars';

// In-memory cache for fast synchronous access during React renders
const memoryBlobUrls = new Map<string, string>();
const pendingFetches = new Map<string, Promise<string | null>>();

let dbPromise: Promise<IDBDatabase> | null = null;

function getAvatarDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AVATAR_STORE)) {
        db.createObjectStore(AVATAR_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('[avatarCache] IndexedDB open error:', request.error);
      reject(request.error);
    };
  });

  return dbPromise;
}

async function getStoredBlob(url: string): Promise<Blob | null> {
  try {
    const db = await getAvatarDB();
    return new Promise((resolve) => {
      const tx = db.transaction(AVATAR_STORE, 'readonly');
      const store = tx.objectStore(AVATAR_STORE);
      const req = store.get(url);
      req.onsuccess = () => {
        const res = req.result;
        if (res && res.blob) {
          resolve(res.blob);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveStoredBlob(url: string, blob: Blob): Promise<void> {
  try {
    const db = await getAvatarDB();
    return new Promise((resolve) => {
      const tx = db.transaction(AVATAR_STORE, 'readwrite');
      const store = tx.objectStore(AVATAR_STORE);
      const req = store.put({ blob, timestamp: Date.now() }, url);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // Ignore write errors
  }
}

export async function fetchAndCacheAvatar(fullUrl: string): Promise<string | null> {
  // Check memory map first
  if (memoryBlobUrls.has(fullUrl)) {
    return memoryBlobUrls.get(fullUrl)!;
  }

  // Deduplicate ongoing network fetches
  if (pendingFetches.has(fullUrl)) {
    return pendingFetches.get(fullUrl)!;
  }

  const fetchPromise = (async () => {
    try {
      // 1. Check IndexedDB
      const blob = await getStoredBlob(fullUrl);
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        memoryBlobUrls.set(fullUrl, objectUrl);
        return objectUrl;
      }

      // 2. Fetch over network
      const response = await fetch(fullUrl, { mode: 'cors' });
      if (!response.ok) return fullUrl;

      const newBlob = await response.blob();
      const objectUrl = URL.createObjectURL(newBlob);
      memoryBlobUrls.set(fullUrl, objectUrl);

      // Save to IndexedDB asynchronously
      saveStoredBlob(fullUrl, newBlob);

      return objectUrl;
    } catch (err) {
      // On network error or CORS error, fallback to raw URL
      return fullUrl;
    } finally {
      pendingFetches.delete(fullUrl);
    }
  })();

  pendingFetches.set(fullUrl, fetchPromise);
  return fetchPromise;
}

/**
 * Returns a cached Blob URL or synchronous raw avatar URL if not yet cached.
 */
export function useCachedAvatar(avatarRaw: string | null | undefined): string | null {
  const resolvedUrl = getAvatarUrl(avatarRaw);

  const getInitialState = (): string | null => {
    if (!resolvedUrl) return null;
    if (resolvedUrl.startsWith('./badges/')) return resolvedUrl;
    if (memoryBlobUrls.has(resolvedUrl)) return memoryBlobUrls.get(resolvedUrl)!;
    return resolvedUrl;
  };

  const [cachedUrl, setCachedUrl] = useState<string | null>(getInitialState);

  useEffect(() => {
    if (!resolvedUrl) {
      setCachedUrl(null);
      return;
    }

    if (resolvedUrl.startsWith('./badges/')) {
      setCachedUrl(resolvedUrl);
      return;
    }

    if (memoryBlobUrls.has(resolvedUrl)) {
      setCachedUrl(memoryBlobUrls.get(resolvedUrl)!);
      return;
    }

    let isMounted = true;
    fetchAndCacheAvatar(resolvedUrl).then((url) => {
      if (isMounted && url) {
        setCachedUrl(url);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [resolvedUrl]);

  return cachedUrl;
}
