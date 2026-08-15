import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import SimpleMarkdown from './SimpleMarkdown';
import '../pages/LegalDoc.css';
import './ConsentGate.css';

/**
 * Запрос согласия у пользователей, зарегистрировавшихся до появления документов
 * либо соглашавшихся с прежней редакцией.
 *
 * Почему окно, а не баннер: продолжать обработку данных без действующего
 * согласия нельзя, а «напоминание», которое можно бесконечно закрывать, эту
 * задачу не решает. Поэтому окно модальное и не закрывается мимо-кликом.
 *
 * Требования ст. 9 152-ФЗ, которые здесь соблюдены:
 *   — согласие информированное: текст показан прямо в окне, а не только ссылкой;
 *   — сознательное: флажок снят по умолчанию, нужно активное действие;
 *   — конкретное: обработка данных и рекламные сообщения — раздельные флажки,
 *     отказ от второго не мешает пользоваться сервисом.
 *
 * Отказавшемуся предлагается выход: удерживать человека в сервисе, чьи условия
 * он не принял, неправильно.
 */
const ConsentGate: React.FC = () => {
    const { logout } = useAuth();

    const [needed, setNeeded] = useState(false);
    const [text, setText] = useState<string | null>(null);
    const [accepted, setAccepted] = useState(false);
    const [marketing, setMarketing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Проверяем статус один раз при монтировании.
    useEffect(() => {
        let cancelled = false;
        axios.get('/api/personal-data/consent-status')
            .then(({ data }) => {
                if (!cancelled && data?.needsConsent) setNeeded(true);
            })
            .catch(() => { /* молча: недоступность проверки не должна ломать вход */ });
        return () => { cancelled = true; };
    }, []);

    // Текст подгружаем только когда окно действительно нужно.
    useEffect(() => {
        if (!needed || text) return;
        let cancelled = false;
        axios.get('/api/personal-data/documents/consent')
            .then(({ data }) => { if (!cancelled) setText(data.text); })
            .catch(() => { if (!cancelled) setError('Не удалось загрузить текст. Обновите страницу.'); });
        return () => { cancelled = true; };
    }, [needed, text]);

    const handleAccept = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            await axios.post('/api/personal-data/consent', {
                personalData: true,
                marketing,
            });
            setNeeded(false);
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Не удалось сохранить согласие. Попробуйте ещё раз.');
        } finally {
            setBusy(false);
        }
    }, [marketing]);

    if (!needed) return null;

    return (
        <div className="consent-gate-backdrop" role="dialog" aria-modal="true" aria-label="Согласие на обработку персональных данных">
            <div className="consent-gate-panel">
                <h2 className="consent-gate-title">Обновились условия обработки персональных данных</h2>
                <p className="consent-gate-lead">
                    Чтобы продолжить пользоваться Zvon, ознакомьтесь с документом и подтвердите согласие.
                </p>

                <div className="consent-gate-doc">
                    {error && <p className="legal-doc-error">{error}</p>}
                    {!text && !error && <p className="legal-doc-loading">Загрузка текста…</p>}
                    {text && <SimpleMarkdown text={text} />}
                </div>

                <div className="consent-gate-controls">
                    <label className="consent-gate-check">
                        <input
                            type="checkbox"
                            checked={accepted}
                            onChange={(e) => setAccepted(e.target.checked)}
                        />
                        <span>
                            Я даю согласие на обработку моих персональных данных и ознакомлен с{' '}
                            <a href="/policy" target="_blank" rel="noopener noreferrer">
                                Политикой обработки персональных данных
                            </a>.
                        </span>
                    </label>

                    <label className="consent-gate-check">
                        <input
                            type="checkbox"
                            checked={marketing}
                            onChange={(e) => setMarketing(e.target.checked)}
                        />
                        <span>Я согласен получать информационные и рекламные сообщения (необязательно).</span>
                    </label>

                    {error && <p className="consent-gate-error">{error}</p>}

                    <div className="consent-gate-actions">
                        <button
                            className="consent-gate-accept"
                            disabled={!accepted || busy || !text}
                            onClick={handleAccept}
                        >
                            {busy ? 'Сохранение…' : 'Принимаю'}
                        </button>
                        <button className="consent-gate-decline" disabled={busy} onClick={logout}>
                            Выйти
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConsentGate;
