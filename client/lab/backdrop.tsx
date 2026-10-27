import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppearanceProvider } from '../src/contexts/AppearanceContext';
import LiminalBackdrop from '../src/components/LiminalBackdrop';
import '../src/components/panel-hero.css';
import '../src/components/VoiceChannelView.css';
import '../src/components/VoiceCall.css';

// Макеты экранов: та же разметка корневых контейнеров, что в
// VoiceChannelView.tsx и VoiceCall.tsx, плитки упрощены.
const Tile: React.FC<{ name: string }> = ({ name }) => (
  <div style={{ width: 220, height: 150, borderRadius: 16, background: 'rgba(30,31,38,.75)', border: '1px solid rgba(255,255,255,.08)', display: 'grid', placeItems: 'center' }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#5865f2', margin: '0 auto 8px' }} />
      {name}
    </div>
  </div>
);

const Channel: React.FC = () => {
  const [people, setPeople] = useState(1);
  return (
    <div style={{ display: 'flex', height: '100%', padding: 12, boxSizing: 'border-box' }}>
      <div className={`voice-channel-view panel-hero${people <= 1 ? ' liminal-host' : ''}`} style={{ flex: 1 }}>
        <div className="panel-hero-bg" aria-hidden="true"><div className="blob cyan" /><div className="blob purple" /><div className="blob pink" /></div>
        <LiminalBackdrop active={people <= 1} />
        <header style={{ padding: 20, fontWeight: 700, fontSize: 18 }}>🔊 Общий</header>
        <main style={{ flex: 1, display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          {Array.from({ length: people }, (_, i) => <Tile key={i} name={['Антон', 'Маша', 'Дима', 'Оля'][i]} />)}
        </main>
        <div style={{ padding: 20, display: 'flex', gap: 8, justifyContent: 'center' }}>
          {[0, 1, 2, 3].map(n => <button key={n} id={`people-${n}`} onClick={() => setPeople(n)}>{n} в канале</button>)}
        </div>
      </div>
    </div>
  );
};

const Call: React.FC = () => (
  <div className="voice-call-full-view">
    <LiminalBackdrop />
    <header className="call-topbar"><div /><div className="call-topbar-center"><div className="call-title"><span className="call-title-text">Звонок: masha</span></div><div className="call-duration">В эфире</div></div><div /></header>
    <main className="call-main" style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center' }}><Tile name="Антон" /><Tile name="Маша" /></main>
    <div className="call-controls-bar" style={{ height: 80 }} />
  </div>
);

const view = new URLSearchParams(location.search).get('view');
createRoot(document.getElementById('root')!).render(
  <AppearanceProvider>{view === 'call' ? <Call /> : <Channel />}</AppearanceProvider>
);
