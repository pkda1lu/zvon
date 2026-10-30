import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { AwardShape } from './AwardModel';
import { CollectibleAward, CollectibleProperties } from './CollectibleAward';
import { AppearanceSettings, CollectibleTraits, DEFAULT_COLLECTIBLE } from '../data/awardCollectibles';
import './awards.css';
export interface Award { _id: string; name: string; description: string; model: AwardShape; color: string; rule: string; cutoff: string | null; enabled: boolean; appearance?: AppearanceSettings }
const ProfileAwards: React.FC<{ userId: string }> = ({ userId }) => {
    const [grants, setGrants] = useState<{ _id: string; award: Award; createdAt: string; collectible?: CollectibleTraits; edition?: string }[]>([]);
    const [status, setStatus] = useState('Загружаем награды…');
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let cancelled = false;
        setStatus('Загружаем награды…'); setGrants([]);
        axios.get(`/api/awards/user/${userId}`).then(({ data }) => {
            if (!Array.isArray(data)) throw new Error('Invalid awards response');
            if (!cancelled) { setGrants(data); setStatus(data.length ? '' : 'У пользователя пока нет наград.'); }
        }).catch(() => { if (!cancelled) setStatus('Не удалось загрузить награды.'); });
        return () => { cancelled = true; };
    }, [userId, retry]);
    return <section className="profile-awards"><h3>Награды</h3><p className="awards-hint">Знаки участия и вклада в сообщество. Потяните модель, чтобы рассмотреть.</p>
        {status && <p role="status">{status}{status.startsWith('Не удалось') && <button onClick={() => setRetry(v => v + 1)}>Повторить</button>}</p>}
        <div className="awards-grid">{grants.map(g => <article className="award-card collectible-card" key={g._id}>
            <CollectibleAward model={g.award.model} color={g.award.color} name={g.award.name} traits={g.collectible || DEFAULT_COLLECTIBLE} edition={g.edition} />
            <div className="collectible-card-body"><p>{g.award.description}</p>
            <small>Получена {new Date(g.createdAt).toLocaleDateString('ru-RU')}</small>
            <CollectibleProperties traits={g.collectible || DEFAULT_COLLECTIBLE} /></div>
        </article>)}</div>
    </section>;
};
export default ProfileAwards;
