import { MiniApp } from '../types';

// Список недавно запускавшихся мини-аппок хранится локально, чтобы предлагать
// их для быстрого запуска (в т.ч. из панели голосового чата). Сохраняем только
// лёгкую мету, достаточную для отрисовки пункта списка и повторного открытия.
const KEY = 'zvon-recent-miniapps';
const MAX = 12;

export interface RecentMiniApp {
    _id: string;
    name: string;
    url: string;
    avatar?: string;
    description?: string;
}

export const getRecentMiniApps = (): RecentMiniApp[] => {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter(a => a && a._id && a.url) : [];
    } catch {
        return [];
    }
};

export const addRecentMiniApp = (app: MiniApp | RecentMiniApp) => {
    if (!app || !app._id || !app.url) return;
    const entry: RecentMiniApp = {
        _id: String(app._id),
        name: app.name,
        url: app.url,
        avatar: (app as any).avatar,
        description: (app as any).description,
    };
    try {
        const list = getRecentMiniApps().filter(a => a._id !== entry._id);
        list.unshift(entry);
        localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    } catch { /* localStorage может быть недоступен */ }
};
