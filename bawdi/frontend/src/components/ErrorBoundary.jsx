// src/components/ErrorBoundary.jsx
// Menangkap error render React agar layar tidak menjadi blank putih tanpa pesan.
// Menampilkan pesan ramah + tombol Muat Ulang + detail teknis (untuk diagnosa).
// Catatan: error boundary HARUS berupa class component.
import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log ke console browser untuk memudahkan diagnosa.
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Saat pindah halaman (resetKey berubah), bersihkan error supaya tak nyangkut.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-500/30 shadow-xl p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle size={24} className="text-red-500" />
          </div>
          <p className="text-base font-black text-slate-800 dark:text-slate-100">Terjadi kesalahan</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Halaman ini gagal ditampilkan. Coba muat ulang; bila masih berlanjut, laporkan pesan di bawah ke admin.
          </p>
          <div className="flex gap-2 mt-4 justify-center">
            <button onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold inline-flex items-center gap-2">
              <RefreshCw size={14} /> Muat Ulang
            </button>
            <button onClick={() => { window.location.href = '/'; }}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold">
              Ke Dashboard
            </button>
          </div>
          <details className="mt-4 text-left">
            <summary className="text-xs text-slate-400 dark:text-slate-500 cursor-pointer select-none">Detail teknis</summary>
            <pre className="mt-2 text-[11px] leading-relaxed text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/5 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap break-words">
              {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
