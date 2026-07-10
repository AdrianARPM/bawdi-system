// src/pages/SubmissionsPage.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, FileText } from 'lucide-react';
import { submissionAPI } from '../utils/api';
import { Pill, Card, Spinner, Empty, fmtDate, fmtCurrency, daysSince, RevisiBadge } from '../components/ui';
import useAuthStore from '../context/authStore';

const STATUSES = ['Semua','Menunggu Verifikasi','Terverifikasi','Disetujui','Ditolak','Dibatalkan'];

export default function SubmissionsPage() {
  const { user } = useAuthStore();
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Semua');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  // Debounce input pencarian — kueri ke server hanya setelah berhenti mengetik (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Pencarian & filter status dikerjakan di server; Opsi A: muat semua saat tak mencari
  useEffect(() => {
    const load = async () => {
      try {
        const params = { limit: 1000 };
        if (filter !== 'Semua')  params.status = filter;
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
        <h1 className="text-xl font-black text-slate-800">
          {user?.role === 'Operasional' ? 'Pengajuan Saya' : 'Semua Pengajuan'}
        </h1>
        {['Operasional','Admin'].includes(user?.role) && (
          <Link to="/new" className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-3 py-2 rounded-xl">
            <Plus size={14} /> Buat Baru
          </Link>
        )}
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nomor, kendaraan, atau pemohon..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filter === s ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
            }`}>{s}</button>
        ))}
      </div>

      {subs.length === 0 && <Empty icon={FileText} message="Tidak ada pengajuan ditemukan" sub="Coba ubah kata kunci atau filter" />}

      <div className="space-y-2.5">
        {subs.map(s => {
          const isAlert = ['Menunggu Verifikasi','Terverifikasi'].includes(s.status) && daysSince(s.tanggal) > 3;
          const notaAlert = s.status === 'Disetujui' && !s.nota_url && daysSince(s.approval_at) >= 1;
          return (
            <Link key={s.id} to={`/submissions/${s.id}`}
              className={`block bg-white rounded-2xl p-4 border shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${
                notaAlert ? 'border-red-200' : isAlert ? 'border-orange-200' : 'border-slate-100'
              }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{s.type}</span>
                    <span className="text-sm font-bold text-slate-800 truncate">
                      {isAlert && <span className="text-orange-500">⚠ </span>}{s.nomor_pengajuan}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mb-0.5">{s.kendaraan} · {s.vendor}</p>
                  <p className="text-xs text-slate-400">{s.pemohon?.name} · {fmtDate(s.tanggal)}</p>
                 {isAlert && (
                    <p className="text-xs font-semibold text-orange-500 mt-1.5">⚠ {daysSince(s.tanggal)} hari tidak ada tanggapan</p>
                  )}
                  {notaAlert && (
                    <p className="text-xs font-semibold text-red-500 mt-1.5">⚠ Nota belum diunggah ({daysSince(s.approval_at)} hari)</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <Pill status={s.status} />
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
