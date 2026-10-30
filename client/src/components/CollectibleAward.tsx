import React from 'react';
import AwardModel, { AwardShape } from './AwardModel';
import { AWARD_BACKGROUNDS, AWARD_PALETTES, AWARD_PATTERNS, AWARD_FINISHES, CollectibleTraits } from '../data/awardCollectibles';
import './awards.css';

const Pattern: React.FC<{ kind: CollectibleTraits['pattern'] }> = ({ kind }) => <svg className="collectible-pattern" viewBox="0 0 300 300" aria-hidden="true" focusable="false">
    {Array.from({ length: 25 }, (_, i) => <g key={i} transform={`translate(${(i % 5) * 72 - 15 + (Math.floor(i / 5) % 2) * 30},${Math.floor(i / 5) * 68 + 10}) rotate(${(i % 3 - 1) * 18})`}>
        {kind === 'signal' ? <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M-8 -6V6M0 -12V12M8 -6V6" /></g>
            : kind === 'stars' ? <path fill="currentColor" d="M0-12 3-3 12 0 3 3 0 12-3 3-12 0-3-3Z" />
            : kind === 'orbits' ? <g fill="none" stroke="currentColor" strokeWidth="1.6"><ellipse rx="15" ry="7" transform="rotate(-35)" /><circle r="3" fill="currentColor" /></g>
            : kind === 'diamonds' ? <path d="M0-14 12 0 0 14-12 0ZM-12 0H12M0-14V14" fill="none" stroke="currentColor" strokeWidth="1.6" />
            : kind === 'waves' ? <path d="M-17-5Q-9-15 0-5T17-5M-17 5Q-9-5 0 5T17 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            : kind === 'lightning' ? <path d="M2-15-10 2H-1L-3 15 11-3H2Z" fill="currentColor" />
            : kind === 'constellation' ? <g stroke="currentColor" strokeWidth="1.4"><path d="M-12 7-3-10 12-3 5 12" fill="none" />{[[-12,7],[-3,-10],[12,-3],[5,12]].map(([x,y],j)=><circle key={j} cx={x} cy={y} r="2.5" fill="currentColor" />)}</g>
            : <path d="M-8-9H6Q12-9 8-3L-5 8H9L12 12 7 9H-6Q-12 9-7 3L5-7" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}
    </g>)}
</svg>;
interface Props {
    model: AwardShape; color: string; name: string; traits: CollectibleTraits; edition?: string; preview?: boolean;
}
export const CollectibleAward: React.FC<Props> = ({ model, color, name, traits, edition, preview }) => {
    const bg = AWARD_BACKGROUNDS[traits.background];
    const palette = AWARD_PALETTES[traits.palette];
    return <div className="collectible-art" style={{ '--collectible-top': bg.top, '--collectible-bottom': bg.bottom, '--collectible-ink': bg.ink, '--award-color': palette.accent } as React.CSSProperties}>
        <Pattern kind={traits.pattern} />
        <div className="collectible-topline"><span>ЗВОН · КОЛЛЕКЦИЯ</span>{preview && <span>Пример</span>}</div>
        <AwardModel model={model} color={color} palette={traits.palette} finish={traits.finish} />
        <div className="collectible-caption"><h4>{name}</h4>{edition && <span className="collectible-number" title={`Номер экземпляра ${edition}`}>№ {edition}</span>}</div>
    </div>;
};
export const CollectibleProperties: React.FC<{ traits: CollectibleTraits }> = ({ traits }) => <details className="collectible-properties"><summary>Свойства экземпляра</summary><dl>
    <div><dt>Палитра</dt><dd>{AWARD_PALETTES[traits.palette].label}</dd></div>
    <div><dt>Фон</dt><dd>{AWARD_BACKGROUNDS[traits.background].label}</dd></div>
    <div><dt>Узор</dt><dd>{AWARD_PATTERNS[traits.pattern]}</dd></div>
    <div><dt>Покрытие</dt><dd>{AWARD_FINISHES[traits.finish]}</dd></div>
</dl></details>;
