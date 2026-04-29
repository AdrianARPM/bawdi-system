// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Register Service Worker untuk offline capability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => console.log('✅ Service Worker terdaftar'))
      .catch(() => console.log('ℹ️  Service Worker tidak tersedia'));
  });
}

// Tampilkan/sembunyikan banner offline
window.addEventListener('online',  () => {
  document.getElementById('offline-banner')?.classList.add('hidden');
});
window.addEventListener('offline', () => {
  document.getElementById('offline-banner')?.classList.remove('hidden');
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
