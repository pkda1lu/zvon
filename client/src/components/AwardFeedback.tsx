import React from 'react';
import { CheckCircle2, AlertCircle, Loader2, Medal } from 'lucide-react';

export interface AwardNotice { kind: 'success' | 'error'; text: string }
export const AwardFeedback: React.FC<{ notice: AwardNotice }> = ({ notice }) => <div className={`award-feedback award-feedback--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
  {notice.kind === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}<span>{notice.text}</span>
</div>;

export const AwardsEmptyState: React.FC<{ kind: 'empty' | 'loading' | 'error'; onRetry?: () => void }> = ({ kind, onRetry }) => <div className={`awards-empty awards-empty--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
  <div className="awards-empty__icon">{kind === 'loading' ? <Loader2 size={28} className="awards-spinner" /> : kind === 'error' ? <AlertCircle size={28} /> : <Medal size={30} />}</div>
  <h4>{kind === 'loading' ? 'Загружаем награды' : kind === 'error' ? 'Награды пока недоступны' : 'Награды ещё впереди'}</h4>
  <p>{kind === 'loading' ? 'Собираем коллекцию пользователя…' : kind === 'error' ? 'Не удалось получить коллекцию. Попробуйте загрузить её ещё раз.' : 'Здесь появятся награды за участие и вклад в сообщество.'}</p>
  {kind === 'error' && <button className="zv-btn zv-btn--ghost" onClick={onRetry}>Повторить загрузку</button>}
</div>;
