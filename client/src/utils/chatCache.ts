import { Server, DirectMessage, User, Message } from '../types';

const DB_NAME = 'zvon_chat_db';
const DB_VERSION = 1;
const KV_STORE = 'kv_store';
const MESSAGES_STORE = 'messages_store';
const PINS_STORE = 'pins_store';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE);
      }
      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        db.createObjectStore(MESSAGES_STORE);
      }
      if (!db.objectStoreNames.contains(PINS_STORE)) {
        db.createObjectStore(PINS_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('[chatCache] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
  });

  return dbPromise;
}

async function getItem<T>(storeName: string, key: string): Promise<T | null> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setItem<T>(storeName: string, key: string, value: T): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // Ignore cache write errors
  }
}

export const chatCache = {
  // Servers
  async getServers(): Promise<Server[] | null> {
    return getItem<Server[]>(KV_STORE, 'servers');
  },
  async saveServers(servers: Server[]): Promise<void> {
    return setItem(KV_STORE, 'servers', servers);
  },

  // Direct Messages (DMs)
  async getDMs(): Promise<DirectMessage[] | null> {
    return getItem<DirectMessage[]>(KV_STORE, 'dms');
  },
  async saveDMs(dms: DirectMessage[]): Promise<void> {
    return setItem(KV_STORE, 'dms', dms);
  },

  // Friends
  async getFriends(): Promise<User[] | null> {
    return getItem<User[]>(KV_STORE, 'friends');
  },
  async saveFriends(friends: User[]): Promise<void> {
    return setItem(KV_STORE, 'friends', friends);
  },

  // Global Users Profile Map
  async getGlobalUsers(): Promise<Record<string, Partial<User>> | null> {
    return getItem<Record<string, Partial<User>>>(KV_STORE, 'global_users');
  },
  async saveGlobalUsers(users: Record<string, Partial<User>>): Promise<void> {
    return setItem(KV_STORE, 'global_users', users);
  },

  // Messages per channel or DM
  async getMessages(targetId: string): Promise<Message[] | null> {
    if (!targetId) return null;
    return getItem<Message[]>(MESSAGES_STORE, targetId);
  },
  async saveMessages(targetId: string, messages: Message[]): Promise<void> {
    if (!targetId) return;
    return setItem(MESSAGES_STORE, targetId, messages);
  },

  // Pinned Messages per channel or DM
  async getPins(targetId: string): Promise<Message[] | null> {
    if (!targetId) return null;
    return getItem<Message[]>(PINS_STORE, targetId);
  },
  async savePins(targetId: string, pins: Message[]): Promise<void> {
    if (!targetId) return;
    return setItem(PINS_STORE, targetId, pins);
  }
};
