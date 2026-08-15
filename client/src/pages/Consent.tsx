import React, { useEffect, useState } from 'react';
import { getIconBrand } from '../utils/branding';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import SimpleMarkdown from '../components/SimpleMarkdown';
import './Docs.css';
import './LegalDoc.css';

/**
 * Текст согласия на обработку персональных данных.
 *
 * Отдельная страница нужна, чтобы человек мог прочитать, с чем именно
 * соглашается, ДО регистрации: по ст. 9 152-ФЗ согласие должно быть
 * информированным. Ссылка ведёт сюда с формы регистрации.
 *
 * Как и политика, текст берётся с сервера — из того же файла, от которого
 * считается контрольная сумма в записи о согласии.
 */
const Consent: React.FC = () => {
    const navigate = useNavigate();
    const brand = getIconBrand();

    const [text, setText] = useState<string | null>(null);
    const [meta, setMeta] = useState<{ version: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        axios.get('/api/personal-data/documents/consent')
            .then(({ data }) => {
                if (cancelled) return;
                setText(data.text);
                setMeta({ version: data.version });
            })
            .catch(() => { if (!cancelled) setError('Не удалось загрузить документ. Обновите страницу.'); });
        return () => { cancelled = true; };
    }, []);

    return (
        <div className="docs-container legal-doc" style={{ padding: '0 20px' }}>
            <div className="legal-doc-panel">
                <button className="legal-doc-back" onClick={() => navigate('/')}>← На главную</button>

                {meta && (
                    <div className="legal-doc-meta">
                        {brand.name} · редакция {meta.version}
                    </div>
                )}

                {error && <p className="legal-doc-error">{error}</p>}
                {!text && !error && <p className="legal-doc-loading">Загрузка…</p>}
                {text && <SimpleMarkdown text={text} />}
            </div>
        </div>
    );
};

export default Consent;
