// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ReloadPrompt from './components/ReloadPrompt.jsx';
import './index.css';
import { initTheme } from './utils/theme';  // di bagian import

initTheme();  // letakkan SEBELUM ReactDOM.createRoot(...)
// Tampilkan/sembunyikan banner offline
window.addEventListener('online', () => {
  document.getElementById('offline-banner')?.classList.add('hidden');
});
window.addEventListener('offline', () => {
  document.getElementById('offline-banner')?.classList.remove('hidden');
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <ReloadPrompt />
  </React.StrictMode>
);
