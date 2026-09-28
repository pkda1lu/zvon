import React from 'react';
import { useTransfers, dismissTransfer, Transfer } from '../utils/transfers';
import { formatBytes } from '../utils/mediaKind';
import { UploadIcon, DownloadIcon, CheckIcon, AlertIcon } from './Icons';

/**
 * Уведомления о передаче файлов — те же стеклянные тосты, что у остальных
 * уведомлений Zvon (Notification.css), с полосой прогресса. Рисуются внутри
 * общего .notification-container (см. NotificationProvider).
 */
const titleOf = (t: Transfer) => {
    if (t.status === 'done') return t.kind === 'upload' ? 'Файл загружен' : 'Файл скачан';
    if (t.status === 'error') return t.error || (t.kind === 'upload' ? 'Не удалось загрузить' : 'Не удалось скачать');
    if (t.status === 'canceled') return 'Отменено';
    return t.kind === 'upload' ? 'Загрузка файла' : 'Скачивание файла';
};

const metaOf = (t: Transfer) => {
    if (t.status !== 'active') return formatBytes(t.total || t.loaded);
    const loaded = formatBytes(t.loaded) || '0 Б';
    if (!t.total) return loaded;
    const pct = Math.min(100, Math.round((t.loaded / t.total) * 100));
    return `${loaded} из ${formatBytes(t.total)} · ${pct}%`;
};

const toneOf = (t: Transfer) =>
    t.status === 'error' ? 'error' : t.status === 'done' ? 'success' : t.status === 'canceled' ? 'warning' : 'message';

const Icon: React.FC<{ t: Transfer }> = ({ t }) => {
    if (t.status === 'done') return <CheckIcon size={20} color="#fff" />;
    if (t.status === 'error') return <AlertIcon size={20} color="#fff" />;
    return t.kind === 'upload' ? <UploadIcon size={20} color="#fff" /> : <DownloadIcon size={20} color="#fff" />;
};

const TransferToasts: React.FC = () => {
    const transfers = useTransfers();
    return (
        <>
            {transfers.map(t => (
                <div key={t.id} className={`notification-toast transfer-toast ${toneOf(t)}`} role="status" aria-live="polite">
                    <div className="notification-avatar-container">
                        <div className={`notification-avatar-placeholder transfer-toast-icon ${toneOf(t)}`}>
                            <Icon t={t} />
                        </div>
                    </div>
                    <div className="notification-body">
                        <div className="notification-title">{titleOf(t)}</div>
                        <div className="transfer-toast-name">{t.name}</div>
                        {t.status === 'active' && (
                            t.total > 0
                                ? <progress className="transfer-toast-progress" value={t.loaded} max={t.total} />
                                : <progress className="transfer-toast-progress" />
                        )}
                        <div className="transfer-toast-meta">{metaOf(t)}</div>
                    </div>
                    <button
                        className="notification-close"
                        title={t.status === 'active' ? 'Отменить' : 'Скрыть'}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (t.status === 'active') t.cancel(); else dismissTransfer(t.id);
                        }}
                    >×</button>
                </div>
            ))}
        </>
    );
};

export default TransferToasts;
