import React, { useEffect, useState } from 'react';
import { SettingsToggle } from './SettingsUI';

interface IntegrationStatus {
  enabled: boolean;
  listening: boolean;
  games: { id: 'dota2' | 'cs2'; available: boolean; installed: boolean; receiving: boolean }[];
}

const GameIntegrationSettings: React.FC = () => {
  const desktop = (window as any).electron;
  const supported = desktop?.isTauri === true;
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    const refresh = () => desktop.ipc.invoke('game-integration:status').then((next: IntegrationStatus) => {
      if (!cancelled) setStatus(next);
    }).catch(() => { if (!cancelled) setError('Не удалось получить состояние интеграции. Перезапустите настольный клиент после обновления.'); });
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [supported]);
  const perform = async (channel: string, value: unknown) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const next = await desktop.ipc.invoke(channel, value);
      setStatus(next);
      if (channel.endsWith(':install')) setNotice(`Конфигурация ${value === 'dota2' ? 'Dota 2' : 'CS2'} установлена. Перезапустите игру.${value === 'dota2' ? ' Добавьте -gamestateintegration в параметры запуска Dota 2 в Steam.' : ''}`);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  return <>
    <div className="settings-section-title">Подробная игровая активность</div>
    <div className="settings-card">
      <div className="settings-row">
        <div className="settings-row-text"><h3>Dota 2 и Counter-Strike 2</h3><p>Показывать состояние игры, игровое время Dota 2, карту и счёт CS2. Точный режим отображается, только если игра его сообщает.</p></div>
        {supported && status && <div aria-busy={busy} style={{ pointerEvents: busy ? 'none' : undefined }}><SettingsToggle checked={status.enabled} onChange={value => { void perform('game-integration:enabled', value); }} /></div>}
      </div>
      {!supported ? <p className="settings-description">Доступно в настольном клиенте Звона на Tauri.</p> : <>
        {!status && !error && <p className="settings-description">Поиск установленных игр…</p>}
        {status && !status.listening && <p role="alert" className="settings-description">Локальный приёмник недоступен. Возможно, порт 29873 занят. Перезапустите Звон.</p>}
        {status?.games.map(game => <div className="settings-row" key={game.id}>
          <div className="settings-row-text"><h3>{game.id === 'dota2' ? 'Dota 2' : 'Counter-Strike 2'}</h3><p>{!game.available ? 'Игра не найдена в библиотеках Steam.' : game.receiving ? 'Данные от игры поступают.' : game.installed ? status.enabled ? 'Подключено. Ожидание данных от игры.' : 'Конфигурация установлена. Подробная активность выключена.' : 'Нужно установить конфигурацию Game State Integration.'}</p></div>
          <button className="settings-btn secondary" disabled={busy || !game.available} onClick={() => { void perform('game-integration:install', game.id); }}>{game.installed ? 'Переустановить' : 'Подключить'}</button>
        </div>)}
        <p className="settings-description">Для Dota 2: Steam → свойства игры → параметры запуска → добавьте <code>-gamestateintegration</code>. После подключения перезапустите игру. Звон создаёт только свой конфигурационный файл; параметры Steam не меняются.</p>
        <p className="settings-description">При выключенном обнаружении активности данные не публикуются. Настройки видимости профиля продолжают действовать.</p>
        {notice && <p role="status" className="settings-description">{notice}</p>}
        {error && <p role="alert" style={{ color: 'var(--danger)', overflowWrap: 'anywhere' }}>{error}</p>}
      </>}
    </div>
  </>;
};

export default GameIntegrationSettings;
