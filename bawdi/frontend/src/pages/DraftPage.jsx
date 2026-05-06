// src/pages/DraftPage.jsx  — v4 (dengan Export PDF & Excel)
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive, Search, Filter, X, FileText,
  Calendar, Truck, Download, Loader
} from 'lucide-react';
import toast from 'react-hot-toast';
import { revisionAPI, submissionAPI } from '../utils/api';
import { Card, Spinner, Empty, fmtDate, fmtCurrency } from '../components/ui';
import { exportToPDF, exportSinglePDF } from '../utils/exportHelper';
import useAuthStore from '../context/authStore';

export default function DraftPage() {
  const { user } = useAuthStore();

  const [drafts,         setDrafts]         = useState([]);
  const [kendaraanList,  setKendaraanList]  = useState([]);
  const [bulanList,      setBulanList]      = useState([]);
  const [total,          setTotal]          = useState(0);
  const [loading,        setLoading]        = useState(true);
  const [exporting, setExporting] = useState(''); // 'pdf' | 'pdf-{id}'

  const [q,              setQ]              = useState('');
  const [filterKendaraan, setFilterKendaraan] = useState('');
  const [filterBulan,    setFilterBulan]    = useState('');
  const [filterTahun,    setFilterTahun]    = useState('');
  const [page,           setPage]           = useState(1);
  const LIMIT = 15;

  const [stats, setStats] = useState({ totalDraft: 0, totalBayar: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (filterKendaraan) params.kendaraan = filterKendaraan;
      if (filterBulan)     params.bulan     = filterBulan;
      if (filterTahun)     params.tahun     = filterTahun;

      const { data } = await revisionAPI.getDraft(params);
      setDrafts(data.data || []);
      setTotal(data.total || 0);
      setKendaraanList(data.kendaraanList || []);
      setBulanList(data.bulanList || []);
      const all = data.data || [];
      setStats({
        totalDraft: data.total || 0,
        totalBayar: all.reduce((s, d) => s + (Number(d.jumlah_bayar) || 0), 0),
      });
    } catch { toast.error('Gagal memuat draft'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterKendaraan, filterBulan, filterTahun, page]);

  const resetFilter = () => {
    setFilterKendaraan(''); setFilterBulan(''); setFilterTahun('');
    setPage(1); setQ('');
  };

  const hasFilter = filterKendaraan || filterBulan || filterTahun;
  const filtered  = drafts.filter(d => {
    if (!q) return true;
    const ql = q.toLowerCase();
    return (
      d.nomor_pengajuan?.toLowerCase().includes(ql) ||
      d.kendaraan?.toLowerCase().includes(ql) ||
      d.vendor?.toLowerCase().includes(ql) ||
      d.pemohon_name?.toLowerCase().includes(ql)
    );
  });
  const totalPages = Math.ceil(total / LIMIT);

  // ── Ambil semua data untuk export (tanpa pagination) ─────
  const fetchAllForExport = async () => {
    const params = { page: 1, limit: 9999 };
    if (filterKendaraan) params.kendaraan = filterKendaraan;
    if (filterBulan)     params.bulan     = filterBulan;
    if (filterTahun)     params.tahun     = filterTahun;
    const { data } = await revisionAPI.getDraft(params);
    return data.data || [];
  };

  // ── Export PDF (list) ─────────────────────────────────────
  const handleExportPDF = async () => {
    setExporting('pdf');
    try {
      toast.loading('Menyiapkan file PDF...', { id: 'export' });
      const allData = await fetchAllForExport();
      if (allData.length === 0) { toast.error('Tidak ada data untuk diekspor'); setExporting(''); return; }
      const filterInfo = {
        kendaraan: filterKendaraan,
        bulanLabel: bulanList.find(b => b.bulan === Number(filterBulan) && b.tahun === Number(filterTahun))?.label,
      };
      await exportToPDF(allData, filterInfo, 'Draft_Pengajuan_BAWDI');
      toast.success(`✅ ${allData.length} data berhasil diekspor ke PDF!`, { id: 'export' });
    } catch (err) {
      console.error(err);
      toast.error('Gagal export PDF: ' + err.message, { id: 'export' });
    }
    setExporting('');
  };

  // ── Export PDF single pengajuan ───────────────────────────
  const handleExportSinglePDF = async (draftItem) => {
    const key = `pdf-${draftItem.id}`;
    setExporting(key);
    try {
      toast.loading('Membuat PDF pengajuan...', { id: 'export-single' });
      // Ambil detail lengkap
      const { data } = await submissionAPI.getOne(draftItem.id);
      await exportSinglePDF(data.data);
      toast.success('PDF pengajuan berhasil dibuat!', { id: 'export-single' });
    } catch (err) {
      console.error(err);
      toast.error('Gagal buat PDF: ' + err.message, { id: 'export-single' });
    }
    setExporting('');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Archive size={20} className="text-slate-500"/> Draft / Arsip
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Pengajuan yang sudah selesai & ditutup</p>
        </div>
        {/* Export Button */}
        <div>
          <button onClick={handleExportPDF} disabled={!!exporting || loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm shadow-red-200">
            {exporting === 'pdf'
              ? <Loader size={13} className="animate-spin"/>
              : <FileText size={13}/>
            }
            Export PDF
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
        <p className="text-xs text-blue-600 font-medium">
          💡 Tombol <strong>Export PDF</strong> mengunduh laporan semua data sesuai filter aktif.
          Untuk PDF 1 pengajuan, klik tombol PDF di setiap baris.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="!p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Total Arsip</p>
          <p className="text-3xl font-black text-slate-800">{stats.totalDraft}</p>
          <p className="text-xs text-slate-400 mt-1">pengajuan selesai</p>
        </Card>
        <Card className="!p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Total Dibayar</p>
          <p className="text-lg font-black text-emerald-600">{fmtCurrency(stats.totalBayar)}</p>
          <p className="text-xs text-slate-400 mt-1">
            {filterBulan
              ? `${bulanList.find(b => b.bulan === Number(filterBulan))?.label || 'bulan dipilih'}`
              : 'semua periode'}
          </p>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Cari nomor, kendaraan, vendor, pemohon..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"/>
      </div>

      {/* Filter Panel */}
      <Card className="!p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-slate-500"/>
          <p className="text-sm font-bold text-slate-700">Filter</p>
          {hasFilter && (
            <button onClick={resetFilter} className="ml-auto flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700">
              <X size={12}/> Reset Filter
            </button>
          )}
        </div>

        {/* Filter Kendaraan */}
        <div className="mb-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1.5">
            <Truck size={12}/> Plat Kendaraan
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => { setFilterKendaraan(''); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                !filterKendaraan ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-amber-300'
              }`}>Semua</button>
            {kendaraanList.map(k => (
              <button key={k} onClick={() => { setFilterKendaraan(k); setPage(1); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  filterKendaraan === k ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-amber-300'
                }`}>{k}</button>
            ))}
            {kendaraanList.length === 0 && <p className="text-xs text-slate-400 italic">Belum ada data</p>}
          </div>
        </div>

        {/* Filter Bulan */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1.5">
            <Calendar size={12}/> Bulan Pengajuan
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => { setFilterBulan(''); setFilterTahun(''); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                !filterBulan ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'
              }`}>Semua Bulan</button>
            {bulanList.map(b => (
              <button key={`${b.bulan}-${b.tahun}`}
                onClick={() => { setFilterBulan(String(b.bulan)); setFilterTahun(String(b.tahun)); setPage(1); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  filterBulan === String(b.bulan) && filterTahun === String(b.tahun)
                    ? 'bg-blue-500 border-blue-500 text-white'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'
                }`}>{b.label}</button>
            ))}
            {bulanList.length === 0 && <p className="text-xs text-slate-400 italic">Belum ada data</p>}
          </div>
        </div>

        {hasFilter && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
            <span className="text-[10px] font-semibold text-slate-400">Filter aktif:</span>
            {filterKendaraan && (
              <span className="flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                🚗 {filterKendaraan}
                <button onClick={() => setFilterKendaraan('')}><X size={9}/></button>
              </span>
            )}
            {filterBulan && (
              <span className="flex items-center gap-1 bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                📅 {bulanList.find(b => b.bulan === Number(filterBulan))?.label || filterBulan}
                <button onClick={() => { setFilterBulan(''); setFilterTahun(''); }}><X size={9}/></button>
              </span>
            )}
          </div>
        )}
      </Card>

      {/* Result count */}
      {!loading && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Menampilkan <strong className="text-slate-600">{filtered.length}</strong> dari <strong className="text-slate-600">{total}</strong> arsip
          </p>
          {total > LIMIT && (
            <p className="text-xs text-slate-400">Hal. {page}/{totalPages}</p>
          )}
        </div>
      )}

      {/* List */}
      {loading ? <Spinner size={28}/> : filtered.length === 0 ? (
        <Empty icon={Archive} message="Belum ada arsip" sub="Arsip muncul setelah pengajuan ditutup oleh Approval"/>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(d => (
            <div key={d.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <Link to={`/submissions/${d.id}`} className="block p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{d.type}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">🏁 Selesai</span>
                      <span className="text-sm font-bold text-slate-800 truncate">{d.nomor_pengajuan}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Truck size={11} className="text-amber-500 flex-shrink-0"/>
                      <p className="text-xs font-bold text-amber-600">{d.kendaraan}</p>
                    </div>
                    <p className="text-xs text-slate-500 truncate mb-1">
                      {d.vendor_pilihan === 2 ? d.vendor2 : d.vendor}
                    </p>
                    <p className="text-xs text-slate-400">{d.pemohon_name} · {fmtDate(d.tanggal)}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {d.ditutup_at && <span className="text-[10px] text-slate-400">🏁 Tutup: {fmtDate(d.ditutup_at)}</span>}
                      {d.tanggal_bayar && <span className="text-[10px] text-emerald-500 font-semibold">💰 Bayar: {fmtDate(d.tanggal_bayar)}</span>}
                      {d.revisi_count > 0 && <span className="text-[10px] text-purple-500 font-semibold">🔄 {d.revisi_count}x revisi</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-black text-emerald-600">{fmtCurrency(d.jumlah_bayar || d.total_harga)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{d.jumlah_bayar > 0 ? 'Dibayar' : 'Total'}</p>
                    {d.nota_url
                      ? <span className="inline-flex items-center gap-0.5 mt-1.5 text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full"><FileText size={8}/> Nota ✓</span>
                      : <span className="inline-flex items-center gap-0.5 mt-1.5 text-[9px] font-bold bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full"><FileText size={8}/> No Nota</span>
                    }
                  </div>
                </div>
              </Link>

              {/* Export row per item */}
              <div className="px-4 py-2 border-t border-slate-50 flex items-center justify-between bg-slate-50/50">
                <p className="text-[10px] text-slate-400">Export pengajuan ini:</p>
                <div className="flex gap-1.5">
                  <button onClick={() => handleExportSinglePDF(d)}
                    disabled={exporting === `pdf-${d.id}`}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-[10px] font-bold transition-all">
                    {exporting === `pdf-${d.id}`
                      ? <Loader size={10} className="animate-spin"/>
                      : <FileText size={10}/>
                    }
                    PDF
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pb-4">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50">
            ← Prev
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = page <= 3 ? i + 1 : page + i - 2;
            if (p < 1 || p > totalPages) return null;
            return (
              <button key={p} onClick={() => setPage(p)}
                className={`w-9 h-9 rounded-xl text-sm font-bold transition-all ${p === page ? 'bg-amber-500 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {p}
              </button>
            );
          })}
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
