// src/components/OverdueModal.jsx — Dark Mode Tahap 5 (hanya penambahan varian dark:, tanpa perubahan fitur)
// Modal pengingat pengajuan > 3 hari yang muncul di dashboard untuk
// Verifikator, Approval, Kepala Operasional, dan Admin.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, ArrowRight, X } from 'lucide-react';
import { submissionAPI } from '../utils/api';
import useAuthStore from '../context/authStore';

const fmtRpShort = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(1) + 'jt';
  if (n >= 1e3) return 'Rp ' + (n / 1e3).toFixed(0) + 'rb';
  return 'Rp ' + n;
};

export default function OverdueModal() {
  const { user }  = useAuthStore();
  const navigate  = useNavigate();
  const [items, setItems]     = useState([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(true);

  // Role yang dapat modal ini
  const eligible =
    ['Admin', 'Verifikator', 'Approval'].includes(user?.role) ||
    user?.jabatan === 'Kepala Operasional';

  useEffect(() => {
    if (!eligible) { setLoading(false); return; }
    let alive = true;
    submissionAPI.overdueAction()
      .then(({ data }) => {
        if (!alive) return;
        const list = data?.data || [];
        setItems(list);
        // Tampilkan modal hanya jika ada item DAN belum di-dismiss sesi ini
        const dismissed = sessionStorage.getItem('overdue_dismissed') === today();
        if (list.length > 0 && !dismissed) setOpen(true);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [eligible]); // eslint-disable-line

  const today = () => new Date().toDateString();

  const dismiss = () => {
    // Dismiss hanya untuk sesi hari ini — besok muncul lagi
    sessionStorage.setItem('overdue_dismissed', today());
    setOpen(false);
  };

  const handleItem = (id) => {
    setOpen(false);
    navigate(`/submissions/${id}`);
  };

  if (loading || !eligible || !open || items.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease]">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header merah — urgent */}
        <div className="bg-gradient-to-r from-red-500 to-orange-500 px-6 py-5 text-white relative">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={22} className="text-white"/>
            </div>
            <div>
              <h2 className="text-lg font-black leading-tight">Tindakan Diperlukan!</h2>
              <p className="text-xs text-white/85 mt-0.5">
                {items.length} pengajuan sudah lebih dari 3 hari menunggu Anda
              </p>
            </div>
          </div>
        </div>

        {/* Body — daftar overdue */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
            Mohon selesaikan pengajuan berikut sebelum menangani yang baru. Pengajuan yang tertunda
            menghambat proses operasional.
          </p>
          <div className="space-y-2.5">
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => handleItem(it.id)}
                className="w-full text-left bg-slate-50 dark:bg-slate-800/60 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-slate-200 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-500/40 rounded-2xl p-3.5 transition-all group">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">{it.nomor_pengajuan}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${it.type==='PAR'?'bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400':'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                        {it.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{it.kendaraan} • {it.pemohon?.name}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-500">
                        <Clock size={10}/> {it.days} hari
                      </span>
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">{it.action}</span>
                      {it.total_harga > 0 && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">{fmtRpShort(it.total_harga)}</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-amber-500 transition-colors flex-shrink-0 mt-1"/>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <button
            onClick={() => handleItem(items[0].id)}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm transition-colors mb-2">
            Tangani Sekarang →
          </button>
          <button
            onClick={dismiss}
            className="w-full py-2 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            Ingatkan saya nanti
          </button>
        </div>
      </div>
    </div>
  );
}
