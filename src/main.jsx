// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// PWA optional & sicher laden
if ('serviceWorker' in navigator) {
  import('./pwa-register.ts')   // ⬅️ Endung .ts explizit
    .then((m) => {
      if (typeof m?.registerPWA === 'function') m.registerPWA();
    })
    .catch(() => {});
}

import { HashRouter } from 'react-router-dom';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
