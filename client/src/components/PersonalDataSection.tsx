import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

/**
 * Управление своими персональными данными — права субъекта по 152-ФЗ.
 *
 * Реализует то, что закон требует дать пользователю в руки, а не «по запросу на
 * почту»:
 *   ст. 14 — доступ к своим данным (выгрузка);
 *   ст. 14, 21 — прекращение обработки (удаление учётной записи);
 *   ст. 9 ч. 2 — сведения о выданных согласиях и отзыв необязательных.
 *
 * Удаление сделано намеренно неудобным: подтверждение паролем плюс ввод слова.
 * Операция необратима, и случайное нажатие здесь стоит человеку аккаунта.
 */

interface ConsentRecord {
    _id: string;
    purpose: string;
    documentVersion: string;
    granted: boolean;
    grantedAt: string;
    revokedAt: string | null;
}

const PURPOSE_LABELS: Record<string, string> = {
    personal_data: 'Обработка персональных данных',
    cross_border: 'Трансграничная передача',
    marketing: 'Информационные и рекламные сообщения',
};

const PersonalDataSection: React.FC = () => {
    const { logout } = useAuth();

    const [consents, setConsents] = useState<ConsentRecord[]>([]);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [showDelete, setShowDelete] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmWord, setConfirmWord] = useState('');

    const loadConsents = useCallback(async () => {
        try {
            const { data } = await axios.get('/api/personal-data/consents');
            setConsents(Array.isArray(data) ? data : []);
        } catch {
            // Отсутствие истории согласий не повод показывать ошибку на всю страницу.
        }
    }, []);

    useEffect(() => { loadConsents(); }, [loadConsents]);

    const handleExport = async () => {
        setBusy(true); setError(null); setMessage(null);
        try {
            // responseType: 'blob' — ответ отдаётся как файл, а не как JSON,
            // который axios попытался бы разобрать.
            const res = await axios.get('/api/personal-data/export', { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'zvon-мои-данные.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            setMessage('Файл с вашими данными загружен.');
        } catch {
            setError('Не удалось сформировать выгрузку. Попробуйте позже.');
        } finally {
            setBusy(false);
        }
    };

    const handleRevokeMarketing = async () => {
        setBusy(true); setError(null); setMessage(null);
        try {
            await axios.post('/api/personal-data/consents/revoke', { purpose: 'marketing' });
            setMessage('Согласие на рассылку отозвано.');
            await loadConsents();
        } catch {
            setError('Не удалось отозвать согласие.');
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async () => {
        setBusy(true); setError(null); setMessage(null);
        try {
            await axios.post('/api/personal-data/delete-account', {
                password,
                confirm: confirmWord.trim(),
            });
            // Аккаунта больше нет — выходим, оставаться в сессии бессмысленно.
            logout();
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Не удалось удалить учётную запись.');
        } finally {
            setBusy(false);
        }
    };

    const hasMarketing = consents.some(c => c.purpose === 'marketing' && c.granted && !c.revokedAt);

    return (
        <div className="settings-card" style={{ marginTop: '24px' }}>
            <h3 className="settings-section-title" style={{ marginTop: 0 }}>Мои персональные данные</h3>

            <div className="settings-row">
                <div className="settings-row-text">
                    <h3>Выгрузить мои данные</h3>
                    <p>
                        Файл со сведениями, которые о вас хранятся: профиль, сессии и устройства,
                        согласия, ваши сообщения. Сообщения других пользователей в выгрузку не входят.
                    </p>
                </div>
                <button className="settings-btn" disabled={busy} onClick={handleExport}>
                    Скачать
                </button>
            </div>

            {consents.length > 0 && (
                <div className="settings-row" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, display: 'block' }}>
                    <div className="settings-row-text">
                        <h3>Выданные согласия</h3>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-dim)' }}>
                        {consents.map(c => (
                            <div key={c._id} style={{ padding: '4px 0' }}>
                                {PURPOSE_LABELS[c.purpose] || c.purpose}
                                {' — редакция '}{c.documentVersion}
                                {', '}{new Date(c.grantedAt).toLocaleDateString('ru-RU')}
                                {c.revokedAt || !c.granted ? ' (отозвано)' : ''}
                            </div>
                        ))}
                    </div>
                    {hasMarketing && (
                        <button className="settings-btn" disabled={busy} onClick={handleRevokeMarketing} style={{ marginTop: 12 }}>
                            Отозвать согласие на рассылку
                        </button>
                    )}
                </div>
            )}

            <div className="settings-row" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, display: 'block' }}>
                <div className="settings-row-text">
                    <h3 style={{ color: '#ff3b30' }}>Удалить учётную запись</h3>
                    <p>
                        Профиль, почта, сессии и устройства будут удалены безвозвратно.
                        Отправленные вами сообщения останутся у собеседников, но без указания автора —
                        иначе у других людей пропали бы куски их переписки.
                    </p>
                </div>

                {!showDelete ? (
                    <button
                        className="settings-btn"
                        style={{ marginTop: 12, borderColor: '#ff3b30', color: '#ff3b30' }}
                        onClick={() => setShowDelete(true)}
                    >
                        Удалить учётную запись
                    </button>
                ) : (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
                        <input
                            type="password"
                            className="auth-input-glass"
                            placeholder="Ваш пароль"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoComplete="current-password"
                        />
                        <input
                            type="text"
                            className="auth-input-glass"
                            placeholder="Введите слово УДАЛИТЬ"
                            value={confirmWord}
                            onChange={e => setConfirmWord(e.target.value)}
                        />
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                className="settings-btn"
                                style={{ borderColor: '#ff3b30', color: '#ff3b30' }}
                                disabled={busy || !password || confirmWord.trim() !== 'УДАЛИТЬ'}
                                onClick={handleDelete}
                            >
                                Подтвердить удаление
                            </button>
                            <button
                                className="settings-btn"
                                disabled={busy}
                                onClick={() => { setShowDelete(false); setPassword(''); setConfirmWord(''); setError(null); }}
                            >
                                Отмена
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {(message || error) && (
                <div className="settings-row-text" style={{ marginTop: 12 }}>
                    <p style={{ color: error ? '#ff3b30' : 'var(--text-dim)' }}>{error || message}</p>
                </div>
            )}
        </div>
    );
};

export default PersonalDataSection;
