// src/utils/theme.js — v1 (Dark Mode Tahap 1)
// Preferensi: 'light' | 'dark' | 'system' (default: 'system')
// Disimpan di localStorage key 'bawdi-theme'.
// applyTheme() menambah/menghapus class `dark` di <html> dan
// menyesuaikan <meta name="theme-color"> agar status bar PWA ikut berubah.

const KEY = 'bawdi-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

export function getThemePref() {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function isDarkActive(pref = getThemePref()) {
  return pref === 'dark' || (pref === 'system' && media.matches);
}

function syncMetaThemeColor(dark) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0F172A' : '#F59E0B');
}

export function applyTheme(pref = getThemePref()) {
  const dark = isDarkActive(pref);
  document.documentElement.classList.toggle('dark', dark);
  syncMetaThemeColor(dark);
}

export function setThemePref(pref) {
  if (pref === 'system') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  applyTheme(pref);
}

// Panggil sekali di main.jsx sebelum render
export function initTheme() {
  applyTheme();
  // Jika user memilih 'system', ikuti perubahan tema OS secara live
  media.addEventListener('change', () => {
    if (getThemePref() === 'system') applyTheme();
  });
}
