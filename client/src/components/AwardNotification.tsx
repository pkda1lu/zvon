import React from 'react';
import { CollectibleAward } from './CollectibleAward';
import { CollectibleTraits } from '../data/awardCollectibles';
import type { Award } from './ProfileAwards';
import './awards.css';
export interface AwardNotice {
    id: string; grantId: string; noticeAt: string; read: boolean; award: Award; collectible: CollectibleTraits; edition: string;
}
const AwardNotification: React.FC<{ notice: AwardNotice; onOpen: () => void }> = ({ notice, onOpen }) => <div className="award-notice" onClick={e => e.stopPropagation()}>
    <div className="award-notice-eyebrow"><span>✦</span> НОВАЯ НАГРАДА</div>
    <h4>Ваша коллекция пополнилась</h4>
    <p>Вам присвоена награда «{notice.award.name}».</p>
    <CollectibleAward model={notice.award.model} color={notice.award.color} name={notice.award.name} traits={notice.collectible} edition={notice.edition} />
    <button className="award-notice-open" onClick={onOpen}>Посмотреть в профиле <span aria-hidden="true">↗</span></button>
</div>;
export default AwardNotification;
