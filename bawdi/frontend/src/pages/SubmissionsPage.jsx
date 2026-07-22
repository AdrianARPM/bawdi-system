// src/pages/SubmissionsPage.jsx — v2 (Dark Mode Tahap 2: hanya penambahan varian dark:, tanpa perubahan fitur)
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Plus, FileText } from 'lucide-react';
import { submissionAPI } from '../utils/api';
import { Pill, Card, Spinner, Empty, fmtDate, fmtCurrency, daysSince, RevisiBadge } from '../components/ui';
import useAuthStore from '../context/authStore';

const STATUSES = ['Semua','Menunggu Verifikasi','Terverifikasi','Disetujui','Belum Dibayar','Ditolak','Dibatalkan'];
const STATUS_KEY = {
  'Semua': 'total',
  'Menunggu Verifikasi': 'menunggu_verifikasi',
  'Terverifikasi': 'terverifikasi',
  'Disetujui': 'disetujui',
  'Belum Dibayar': 'belum_dibayar',
  'Ditolak': 'ditolak',
  'Dibatalkan': 'dibatalkan',
};
export default function SubmissionsPage() {
  const { user } = useAuthStore();
  const [subs, setSubs] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get('status') || 'Semua';
  const q = searchParams.get('q') || '';
  const setFilter = (val) => setSearchParams(prev => {
    const p = new URLSearchParams(prev);
    if (val && val !== 'Semua') p.set('status', val); else p.delete('status');
    return p;
  }, { replace: true });
  const setQ = (val) => setSearchParams(prev => {
    const p = new URLSearchParams(prev);
    if (val) p.set('q', val); else p.delete('q');
    return p;
  }, { replace: true });
  const [debouncedQ, setDebouncedQ] = useState(searchParams.get('q') || '');

  // Debounce input pencarian — kueri ke server hanya setelah berhenti mengetik (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Pencarian & filter status dikerjakan di server; Opsi A: muat semua saat tak mencari
  useEffect(() => {
    submissionAPI.stats().then(({ data }) => setCounts(data)).catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const params = { limit: 1000 };
        if (filter === 'Belum Dibayar') params.belum_bayar = 1;
        else if (filter !== 'Semua')    params.status = filter;
        if (debouncedQ.trim())   params.q = debouncedQ.trim();
        const { data } = await submissionAPI.list(params);
        setSubs(data.data || []);
      } catch {} finally { setLoading(false); }
    };
    load();
  }, [filter, debouncedQ]);

  if (loading) return <Spinner size={32} />;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">
          {user?.role === 'Operasional' ? 'Pengajuan Saya' : 'Semua Pengajuan'}
        </h1>
        {['Operasional','Admin'].includes(user?.role) && (
          <Link to="/new" className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-3 py-2 rounded-xl">
            <Plus size={14} /> Buat Baru
          </Link>
        )}
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nomor, kendaraan, atau pemohon..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-500/20" />
      </div>

      <div className="flex gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap pb-1 scrollbar-hide">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filter === s ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
            }`}>
            {s}
            {counts && counts[STATUS_KEY[s]] != null && (
              <span className={`min-w-[18px] px-1 rounded-full text-[10px] font-bold ${
                filter === s ? 'bg-white/25 text-white' : (counts[STATUS_KEY[s]] === 0 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-200')
              }`}>{counts[STATUS_KEY[s]]}</span>
            )}
          </button>
        ))}
      </div>

      {subs.length === 0 && <Empty icon={FileText} message="Tidak ada pengajuan ditemukan" sub="Coba ubah kata kunci atau filter" />}

      <div className="space-y-2.5">
        {subs.map(s => {
          // Tunda aktif → keluar dari daftar mendesak (alert oranye dibungkam)
          const isDitunda = !!s.ditunda_sampai && s.ditunda_sampai >= new Date().toISOString().slice(0, 10);
          const isAlert = ['Menunggu Verifikasi','Terverifikasi'].includes(s.status) && daysSince(s.tanggal) > 3 && !isDitunda;
          const notaAlert = s.status === 'Disetujui' && !s.nota_url && daysSince(s.approval_at) >= 1;
          return (
            <Link key={s.id} to={`/submissions/${s.id}`}
              className={`block bg-white dark:bg-slate-900 rounded-2xl p-4 border shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${
                notaAlert ? 'border-red-200 dark:border-red-500/40' : isAlert ? 'border-orange-200 dark:border-orange-500/40' : 'border-slate-100 dark:border-slate-800'
              }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{s.type}</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                      {isAlert && <span className="text-orange-500">⚠ </span>}{s.nomor_pengajuan}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mb-0.5">{s.kendaraan} · {s.vendor}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{s.pemohon?.name} · {fmtDate(s.tanggal)}</p>
                 {isAlert && (
                    <p className="text-xs font-semibold text-orange-500 mt-1.5">⚠ {daysSince(s.tanggal)} hari tidak ada tanggapan</p>
                  )}
                  {notaAlert && (
                    <p className="text-xs font-semibold text-red-500 mt-1.5">⚠ Nota belum diunggah ({daysSince(s.approval_at)} hari)</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <Pill status={s.status} />
                  {isDitunda && (
                    <div className="mt-1 flex justify-end">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                        ⏸ Ditunda s/d {fmtDate(s.ditunda_sampai)}
                      </span>
                    </div>
                  )}
                  {s.revisi_count > 0 && <div className="mt-1 flex justify-end"><RevisiBadge count={s.revisi_count} /></div>}
                  <p className="text-xs font-black text-brand-500 mt-1.5">{fmtCurrency(s.total_harga)}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
