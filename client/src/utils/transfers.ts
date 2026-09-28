import axios, { AxiosResponse } from 'axios';
import { useSyncExternalStore } from 'react';

/*
 * Передача файлов: загрузка на сервер и скачивание — с прогрессом и отменой.
 *
 * Раньше загрузка шла молча (в канале — серая плашка без процентов), а
 * скачивание вообще никак не отображалось: большое видео «ничего не делало»
 * до самого сохранения. Теперь каждая передача живёт в этом хранилище, а
 * TransferToasts рисует её стеклянным уведомлением Zvon рядом с остальными.
 */

export type TransferKind = 'upload' | 'download';
export type TransferStatus = 'active' | 'done' | 'error' | 'canceled';

export interface Transfer {
    id: string;
    kind: TransferKind;
    name: string;
    loaded: number;
    total: number;
    status: TransferStatus;
    error?: string;
    cancel: () => void;
}

let transfers: Transfer[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const snapshot = () => transfers;

export const useTransfers = () => useSyncExternalStore(subscribe, snapshot, snapshot);

const patch = (id: string, changes: Partial<Transfer>) => {
    transfers = transfers.map(t => t.id === id ? { ...t, ...changes } : t);
    emit();
};

export const dismissTransfer = (id: string) => {
    transfers = transfers.filter(t => t.id !== id);
    emit();
};

/** Завершённые убираем сами: успешные быстро, ошибки — чуть дольше, чтобы успели прочитать. */
const finish = (id: string, status: TransferStatus, error?: string) => {
    patch(id, { status, error });
    setTimeout(() => dismissTransfer(id), status === 'done' ? 2500 : status === 'canceled' ? 1200 : 6000);
};

const start = (kind: TransferKind, name: string, total: number, controller: AbortController): string => {
    const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    transfers = [...transfers, { id, kind, name, loaded: 0, total, status: 'active', cancel: () => controller.abort() }];
    emit();
    return id;
};

const isCanceled = (e: unknown) => axios.isCancel(e) || (e as any)?.name === 'CanceledError' || (e as any)?.code === 'ERR_CANCELED';

const describeFiles = (files: File[]) =>
    files.length === 1 ? files[0].name : `${files.length} ${files.length < 5 ? 'файла' : 'файлов'}`;

/**
 * Загрузка файлов на сервер с прогрессом. Возвращает ответ сервера; при
 * отмене пользователем бросает ошибку с полем canceled = true.
 */
export async function uploadFiles<T = any>(
    files: File[],
    options: { url?: string; field?: string; extra?: Record<string, string> } = {}
): Promise<AxiosResponse<T>> {
    const { url = '/api/upload-files', field = 'files', extra } = options;
    const form = new FormData();
    files.forEach(f => form.append(field, f));
    if (extra) Object.entries(extra).forEach(([k, v]) => form.append(k, v));

    const controller = new AbortController();
    const total = files.reduce((s, f) => s + f.size, 0);
    const id = start('upload', describeFiles(files), total, controller);
    try {
        const res = await axios.post<T>(url, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            signal: controller.signal,
            onUploadProgress: (e) => patch(id, { loaded: e.loaded, total: e.total || total }),
        });
        finish(id, 'done');
        return res;
    } catch (e) {
        if (isCanceled(e)) {
            finish(id, 'canceled');
            throw Object.assign(new Error('canceled'), { canceled: true });
        }
        const status = (e as any)?.response?.status;
        finish(id, 'error', status === 413 ? 'Файл слишком большой' : 'Не удалось загрузить');
        throw e;
    }
}

/** Сохранить Blob как файл через обычную ссылку скачивания. */
const saveBlob = (blob: Blob, filename: string) => {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
};

/**
 * Скачивание с прогрессом. Если запрос не удался (например, CORS у внешней
 * ссылки), откатываемся на прямую ссылку — файл откроет сам браузер.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
    const controller = new AbortController();
    const id = start('download', filename, 0, controller);
    try {
        // fetch, а не axios: к файлам не нужен заголовок авторизации приложения
        // (с ним у статики на другом домене начинается CORS-префлайт).
        const res = await fetch(url, { mode: 'cors', signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const total = Number(res.headers.get('content-length')) || 0;
        let blob: Blob;
        if (res.body && typeof res.body.getReader === 'function') {
            const reader = res.body.getReader();
            const chunks: Uint8Array[] = [];
            let loaded = 0;
            let lastEmit = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                loaded += value.length;
                const now = performance.now();
                if (now - lastEmit > 100) { patch(id, { loaded, total }); lastEmit = now; }
            }
            patch(id, { loaded, total: total || loaded });
            blob = new Blob(chunks as BlobPart[], { type: res.headers.get('content-type') || undefined });
        } else {
            blob = await res.blob();
        }
        saveBlob(blob, filename);
        finish(id, 'done');
    } catch (e) {
        if ((e as any)?.name === 'AbortError' || isCanceled(e)) { finish(id, 'canceled'); return; }
        finish(id, 'error', 'Скачивание через браузер');
        // В десктопном клиенте window.open/target=_blank молча игнорируются —
        // отдаём ссылку системному браузеру, он и скачает.
        const electron = (window as any).electron;
        if (electron?.ipc) {
            electron.ipc.send('open-external-url', url);
            return;
        }
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.click();
    }
}
