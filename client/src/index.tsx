import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './Mobile.css';
import App from './App';
import { applyBranding } from './utils/branding';

// Apply branding (title, favicon) immediately
applyBranding();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA: регистрируем service worker (только в браузере, не в Electron).
const _isElectron = !!((window as any).electron?.isElectron || (navigator.userAgent || '').includes('Electron'));
if ('serviceWorker' in navigator && !_isElectron) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[PWA] SW registration failed:', e));
  });
}










