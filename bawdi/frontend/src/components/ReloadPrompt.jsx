// src/components/ReloadPrompt.jsx — banner "versi baru tersedia" — Dark Mode Tahap 5 (hanya varian dark:)
import { useRegisterSW } from 'virtual:pwa-register/react';

export default function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Cek update tiap 60 detik supaya prompt muncul cepat setelah deploy baru
      if (r) setInterval(() => { r.update(); }, 60 * 1000);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 md:left-auto md:right-4 md:w-96 z-[100]
                    bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-500/30 shadow-xl p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
        <span className="text-lg">🔄</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-slate-800 dark:text-slate-100">Versi baru tersedia</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Muat ulang untuk memakai versi terbaru BAWDI.</p>
        <div className="flex gap-2 mt-3">
          <button onClick={() => updateServiceWorker(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold">
            Muat Ulang
          </button>
          <button onClick={() => setNeedRefresh(false)}
            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold">
            Nanti
          </button>
        </div>
      </div>
    </div>
  );
}
