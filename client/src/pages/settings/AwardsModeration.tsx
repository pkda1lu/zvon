import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { AwardShape } from '../../components/AwardModel';
import { CollectibleAward, CollectibleProperties } from '../../components/CollectibleAward';
import { AWARD_PALETTES, AWARD_BACKGROUNDS, AWARD_PATTERNS, AWARD_FINISHES, AppearanceSettings, RANDOM_APPEARANCE, previewTraits } from '../../data/awardCollectibles';
import { Award } from '../../components/ProfileAwards';
import '../../components/awards.css';
import AwardRecipientSelect, { AwardRecipient } from '../../components/AwardRecipientSelect';
import { AwardFeedback, AwardNotice } from '../../components/AwardFeedback';

type AwardAction = (fn: () => Promise<string>, report?: (notice: AwardNotice | null) => void) => Promise<void>;
const AwardEntry: React.FC<{ award: Award; busy: boolean; act: AwardAction; reload: () => Promise<void> }> = ({ award: a, busy, act, reload }) => {
    const [recipient, setRecipient] = useState<AwardRecipient | null>(null);
    const [notice, setNotice] = useState<AwardNotice | null>(null);
    const grant = (revoke: boolean) => act(async () => {
        if (!recipient) throw new Error('Выберите получателя');
        const { data } = await axios.post(`/api/awards/${a._id}/grant`, { userId: recipient._id, revoke });
        return `${data.message} · @${recipient.username}`;
    }, setNotice);
    return <article className="award-card collectible-card"><CollectibleAward model={a.model} color={a.color} name={a.name} traits={previewTraits(a.appearance)} preview /><div className="collectible-card-body"><p>{a.description}</p>
        <CollectibleProperties traits={previewTraits(a.appearance)} />
        <p>{a.rule === 'manual' ? 'Ручная выдача' : `${a.rule === 'registered_before' ? 'Регистрация' : 'Первый визит'} до ${new Date(a.cutoff!).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)`}</p>
        {a.rule !== 'manual' && <div className="award-actions">
            <button disabled={busy} className="settings-btn secondary" onClick={() => act(async () => { await axios.patch(`/api/awards/${a._id}`, { enabled: !a.enabled }); await reload(); return a.enabled ? 'Условие отключено. Выданные награды сохранены.' : 'Условие включено'; })}>{a.enabled ? 'Отключить условие' : 'Включить условие'}</button>
            <button disabled={busy || !a.enabled} className="settings-btn secondary" onClick={() => act(async () => { const { data } = await axios.post(`/api/awards/${a._id}/apply`); return `Выдано новых наград: ${data.count}`; })}>Выдать всем по условию</button>
        </div>}
        <div className="award-grant-panel">
        <AwardRecipientSelect value={recipient} onChange={user => { setRecipient(user); setNotice(null); }} disabled={busy} />
        <div className="award-grant-panel__actions">
            <span className="awards-hint">{recipient ? 'Получатель выбран' : 'Выберите пользователя для выдачи или отзыва'}</span>
            <button className="settings-btn primary" disabled={busy || !recipient} onClick={() => grant(false)}>Выдать</button>
            <button className="settings-btn secondary" disabled={busy || !recipient} onClick={() => grant(true)}>Отозвать</button>
        </div>
        {notice && <AwardFeedback notice={notice} />}
        </div>
    </div></article>;
};
const AwardsModeration: React.FC = () => {
    const [awards, setAwards] = useState<Award[]>([]);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [model, setModel] = useState<AwardShape>('trophy');
    const color = '#8b8dff';
    const [appearance, setAppearance] = useState<AppearanceSettings>({ ...RANDOM_APPEARANCE });
    const [sample, setSample] = useState(0);
    const [rule, setRule] = useState('manual');
    const [date, setDate] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<AwardNotice | null>(null);
    const reload = async () => { const { data } = await axios.get('/api/awards'); if (!Array.isArray(data)) throw new Error('Invalid awards response'); setAwards(data); };
    useEffect(() => { let live = true; axios.get('/api/awards').then(({ data }) => { if (!Array.isArray(data)) throw new Error('Invalid awards response'); if (live) setAwards(data); }).catch(() => { if (live) setMessage({ kind: 'error', text: 'Не удалось загрузить награды. Откройте вкладку повторно.' }); }); return () => { live = false; }; }, []);
    const act: AwardAction = async (fn, report = setMessage) => {
        setBusy(true); setMessage(null); report(null);
        try { report({ kind: 'success', text: await fn() }); } catch (e: any) { report({ kind: 'error', text: e.response?.data?.message || 'Не удалось выполнить действие. Попробуйте ещё раз.' }); }
        finally { setBusy(false); }
    };
    return <div><h3>Награды сообщества</h3>
        <p className="awards-hint">Создавайте награды и выдавайте их вручную или по условию. Автоматические награды появляются при открытии профиля; кнопка «Выдать всем» обрабатывает существующие аккаунты сразу. Отозванные награды автоматически не возвращаются.</p>
        <form className="award-form settings-card" onSubmit={e => { e.preventDefault(); act(async () => { await axios.post('/api/awards', { name, description, model, color, rule, date, appearance }); setName(''); setDescription(''); await reload(); return 'Награда создана'; }); }}>
            <div className="collectible-form-preview"><CollectibleAward model={model} color={color} name={name || 'Новая награда'} traits={previewTraits(appearance, sample)} preview /></div>
            <label>Название<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
            <label>Описание<textarea maxLength={500} value={description} onChange={e => setDescription(e.target.value)} /></label>
            <label>3D-модель<select value={model} onChange={e => setModel(e.target.value as AwardShape)}><option value="trophy">Кубок</option><option value="medal">Медаль</option><option value="crystal">Кристалл</option><option value="rose">Роза</option><option value="star">Звезда</option><option value="bell">Колокольчик</option></select></label>
            <fieldset className="collectible-editor"><legend>Оформление экземпляров</legend>
                <p className="awards-hint">Выберите свойства коллекции или оставьте случайными: сочетание создаётся при выдаче и сохраняется за владельцем.</p>
                {([
                    ['palette', 'Палитра модели', AWARD_PALETTES], ['background', 'Фон', AWARD_BACKGROUNDS],
                    ['pattern', 'Узор', AWARD_PATTERNS], ['finish', 'Покрытие', AWARD_FINISHES]
                ] as const).map(([key, label, options]) => <label key={key}>{label}<select value={appearance[key]} onChange={e => setAppearance(prev => ({ ...prev, [key]: e.target.value }))}>
                    <option value="random">Случайно для каждого владельца</option>
                    {Object.entries(options).map(([id, item]) => <option key={id} value={id}>{typeof item === 'string' ? item : item.label}</option>)}
                </select></label>)}
                <button type="button" className="settings-btn secondary" onClick={() => setSample(v => v + 1)}>Показать другой случайный пример</button>
            </fieldset>
            <label>Условие<select value={rule} onChange={e => setRule(e.target.value)}><option value="manual">Только вручную</option><option value="registered_before">Зарегистрировался до даты</option><option value="visited_before">Заходил до даты</option></select></label>
            {rule !== 'manual' && <><label>До начала дня (МСК)<input required type="date" value={date} onChange={e => setDate(e.target.value)} /></label><p className="awards-hint">Например, до 2026 года — 01.01.2026. До 12 декабря — 12.12 нужного года. Учёт визитов начинается после установки этой функции; старые входы не восстанавливаются.</p></>}
            <button className="settings-btn primary" disabled={busy || !name.trim()}>Создать награду</button>
        </form>
        {message && <AwardFeedback notice={message} />}
        <div className="awards-grid">{awards.map(a => <AwardEntry key={a._id} award={a} busy={busy} act={act} reload={reload} />)}</div>
    </div>;
};
export default AwardsModeration;
