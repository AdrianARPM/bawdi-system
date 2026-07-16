// src/pages/DraftPage.jsx  — v10 (Arsip ringan: default filter tahun berjalan + grup cabang bisa dilipat/accordion — basis v9 dark mode)
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive, Search, Filter, X, FileSpreadsheet,
  Calendar, Truck, Building2, ShieldOff, Loader,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { revisionAPI } from '../utils/api';
import { Card, Spinner, fmtDate, fmtCurrency } from '../components/ui';
import useAuthStore from '../context/authStore';

const ALLOWED_ROLES = ['Admin', 'Verifikator', 'Approval', 'Operasional', 'Pengawas'];
// Operasional hanya melihat arsip pengajuannya sendiri (difilter di backend)

// Default periode = tahun berjalan, agar halaman tetap ringan saat arsip menumpuk
const CURRENT_YEAR = String(new Date().getFullYear());

// Status tagihan dari pembayaran (selaras rumus Excel)
function statusTagihan(total, bayar) {
  const sisa = Math.max(0, (Number(total) || 0) - (Number(bayar) || 0));
  let label = 'Belum Lunas', cls = 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400';
  if (Number(bayar) > 0) {
    if (Number(bayar) >= Number(total)) { label = 'Lunas'; cls = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'; }
    else                                { label = 'DP';    cls = 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'; }
  }
  return { sisa, label, cls };
}

export default function DraftPage() {
  const { user } = useAuthStore();

  if (!ALLOWED_ROLES.includes(user?.role)) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <ShieldOff size={28} className="text-red-400"/>
        </div>
        <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-2">Akses Ditolak</h2>
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Halaman Draft/Arsip hanya dapat diakses oleh Admin, Verifikator, dan Approval.
        </p>
      </div>
    );
  }

  const [drafts,         setDrafts]          = useState([]);
  const [kendaraanList,  setKendaraanList]   = useState([]);
  const [bulanList,      setBulanList]       = useState([]);
  const [total,          setTotal]           = useState(0);
  const [loading,        setLoading]         = useState(true);
  const [exporting,      setExporting]       = useState(false);

  const [q,              setQ]               = useState('');
  const [filterKendaraan, setFilterKendaraan]= useState('');
  const [filterBulan,    setFilterBulan]     = useState('');
  const [filterTahun,    setFilterTahun]     = useState(CURRENT_YEAR);

  // Grup cabang yang sedang terbuka (accordion)
  const [openCabang,     setOpenCabang]      = useState(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterKendaraan) params.kendaraan = filterKendaraan;
      if (filterBulan)     params.bulan     = filterBulan;
      if (filterTahun)     params.tahun     = filterTahun;
      const { data } = await revisionAPI.getDraft(params);
      setDrafts(data.data || []);
      setTotal(data.total || 0);
      setKendaraanList(data.kendaraanList || []);
      setBulanList(data.bulanList || []);
    } catch { toast.error('Gagal memuat arsip'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterKendaraan, filterBulan, filterTahun]);

  // Saat data berubah: jika hasil hanya 1-2 cabang, buka otomatis; selain itu semua terlipat
  useEffect(() => {
    const names = [...new Set(drafts.map(d => d.cabang))];
    setOpenCabang(new Set(names.length <= 2 ? names : []));
  }, [drafts]);

  const toggleCabang = (cab) => {
    setOpenCabang(prev => {
      const next = new Set(prev);
      next.has(cab) ? next.delete(cab) : next.add(cab);
      return next;
    });
  };

  const resetFilter = () => { setFilterKendaraan(''); setFilterBulan(''); setFilterTahun(CURRENT_YEAR); setQ(''); };
  const hasFilter = filterKendaraan || filterBulan || filterTahun !== CURRENT_YEAR;

  // Daftar tahun tersedia — diturunkan dari bulanList (dibangun backend dari seluruh arsip)
  const tahunList = [...new Set(bulanList.map(b => b.tahun))].sort((a, b) => b - a);

  const filtered = drafts.filter(d => {
    if (!q) return true;
    const ql = q.toLowerCase();
    return d.nomor_pengajuan?.toLowerCase().includes(ql) ||
           d.kendaraan?.toLowerCase().includes(ql) ||
           d.cabang?.toLowerCase().includes(ql) ||
           d.pemohon_name?.toLowerCase().includes(ql);
  });

  // Kelompokkan per cabang
  const groups = {};
  filtered.forEach(d => { (groups[d.cabang] = groups[d.cabang] || []).push(d); });
  const cabangNames = Object.keys(groups).sort();

  const totalBayar = filtered.reduce((s, d) => s + (Number(d.dibayar) || 0), 0);

  // Label periode aktif utk kartu ringkasan
  const periodeLabel = filterBulan
    ? (bulanList.find(b => b.bulan === Number(filterBulan) && b.tahun === Number(filterTahun))?.label || 'bulan dipilih')
    : filterTahun ? `Tahun ${filterTahun}` : 'semua periode';

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      toast.loading('Menyiapkan Excel...', { id: 'export' });
      const params = {};
      if (filterKendaraan) params.kendaraan = filterKendaraan;
      params.tahun = filterTahun || new Date().getFullYear();
      await revisionAPI.exportArsip(params);
      toast.success('Excel berhasil diunduh!', { id: 'export' });
    } catch (err) {
      toast.error(err?.message || 'Gagal export Excel', { id: 'export' });
    }
    setExporting(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Archive size={20} className="text-slate-500 dark:text-slate-400"/> Draft / Arsip
          </h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Pengajuan disetujui &amp; selesai · dikelompokkan per cabang</p>
        </div>
        {user?.role !== 'Operasional' && (
          <button onClick={handleExportExcel} disabled={exporting || loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm">
            {exporting ? <Loader size={13} className="animate-spin"/> : <FileSpreadsheet size={13}/>}
            Export Excel
          </button>
        )}
      </div>

      {/* Info akses */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/30 rounded-xl px-4 py-2.5">
        <p className="text-xs text-blue-600 dark:text-blue-300 font-medium">
          {user?.role === 'Operasional'
            ? <>🔒 Anda melihat <strong>arsip pengajuan Anda sendiri</strong> (disetujui &amp; selesai), dikelompokkan per cabang.</>
            : <>🔒 Halaman ini dapat dilihat oleh <strong>Admin, Verifikator, dan Approval</strong> (seluruh arsip) serta <strong>Pemohon</strong> (arsip miliknya sendiri). Export Excel mengunduh rekap per cabang (satu sheet per cabang) untuk tahun terpilih.</>}
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="!p-4">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Total Arsip</p>
          <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{filtered.length}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">pengajuan disetujui &amp; selesai</p>
        </Card>
        <Card className="!p-4">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Total Dibayar</p>
          <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{fmtCurrency(totalBayar)}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{periodeLabel}</p>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"/>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Cari nomor, kendaraan, cabang, pemohon..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20"/>
      </div>

      {/* Filter */}
      <Card className="!p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-slate-500 dark:text-slate-400"/>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Filter</p>
          {hasFilter && (
            <button onClick={resetFilter} className="ml-auto flex items-center gap-1 text-xs font-semibold text-red-500">
              <X size={12}/> Reset
            </button>
          )}
        </div>
        {/* Tahun — default tahun berjalan agar data yg dimuat tetap ringan */}
        <div className="mb-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5"><Calendar size={12}/> Tahun</label>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([Number(CURRENT_YEAR), ...tahunList])].sort((a, b) => b - a).map(t => (
              <button key={t} onClick={() => { setFilterTahun(String(t)); setFilterBulan(''); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${filterTahun===String(t) ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}>
                {t}
              </button>
            ))}
            <button onClick={() => { setFilterTahun(''); setFilterBulan(''); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${!filterTahun ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}>
              Semua Periode
            </button>
          </div>
        </div>
        <div className="mb-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5"><Calendar size={12}/> Bulan</label>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilterBulan('')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${!filterBulan ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}>
              Semua
            </button>
            {bulanList.filter(b => !filterTahun || b.tahun === Number(filterTahun)).map(b => (
              <button key={`${b.bulan}-${b.tahun}`}
                onClick={() => { setFilterBulan(String(b.bulan)); setFilterTahun(String(b.tahun)); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${filterBulan===String(b.bulan)&&filterTahun===String(b.tahun) ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5"><Truck size={12}/> Plat Kendaraan</label>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilterKendaraan('')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${!filterKendaraan ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}>
              Semua
            </button>
            {kendaraanList.map(k => (
              <button key={k} onClick={() => setFilterKendaraan(k)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${filterKendaraan===k ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}>
                {k}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Count */}
      {!loading && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Menampilkan <strong className="text-slate-600 dark:text-slate-300">{filtered.length}</strong> arsip
          dalam <strong className="text-slate-600 dark:text-slate-300">{cabangNames.length}</strong> cabang
          {cabangNames.length > 2 && <span> · klik nama cabang untuk membuka tabelnya</span>}
        </p>
      )}

      {/* Tabel per cabang (accordion) */}
      {loading ? <Spinner size={28}/> : cabangNames.length === 0 ? (
        <div className="py-20 text-center">
          <Archive size={32} className="text-slate-300 dark:text-slate-700 mx-auto mb-3"/>
          <p className="text-sm text-slate-400 dark:text-slate-500">Belum ada arsip pengajuan</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cabangNames.map(cabang => {
            const rows = groups[cabang];
            const tTagihan = rows.reduce((s, d) => s + (Number(d.total_harga) || 0), 0);
            const tBayar   = rows.reduce((s, d) => s + (Number(d.dibayar) || 0), 0);
            const tSisa    = rows.reduce((s, d) => s + statusTagihan(d.total_harga, d.dibayar).sisa, 0);
            const noNota   = rows.filter(d => !d.nota_url).length;
            const isOpen   = openCabang.has(cabang);
            return (
              <Card key={cabang} className="!p-0 overflow-hidden">
                {/* Header cabang — klik untuk buka/lipat, ringkasan tetap terlihat saat terlipat */}
                <button onClick={() => toggleCabang(cabang)} type="button"
                  className="w-full flex items-center gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left">
                  {isOpen ? <ChevronDown size={15} className="text-slate-400 dark:text-slate-500 flex-shrink-0"/> : <ChevronRight size={15} className="text-slate-400 dark:text-slate-500 flex-shrink-0"/>}
                  <Building2 size={15} className="text-amber-500 flex-shrink-0"/>
                  <p className="text-sm font-black text-slate-800 dark:text-slate-100">{cabang}</p>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{rows.length} pengajuan</span>
                  <span className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-0.5 text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">Tagihan <strong className="text-slate-800 dark:text-slate-100">{fmtCurrency(tTagihan)}</strong></span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{fmtCurrency(tBayar)}</span>
                    {tSisa > 0
                      ? <span className="text-red-500 dark:text-red-400 font-bold">sisa {fmtCurrency(tSisa)}</span>
                      : <span className="text-slate-400 dark:text-slate-500">lunas semua</span>}
                  </span>
                </button>
                {isOpen && (<>
                <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
                  <table className="w-full text-xs whitespace-nowrap">
                    <thead>
                      <tr className="bg-emerald-50 dark:bg-emerald-500/10 text-slate-600 dark:text-slate-300 text-left">
                        {['No.','Nopol','Tgl Pengajuan','Tgl App','Tgl Bayar','Nomor PR/PAR','Rincian/Jenis Pembelian','Total Tagihan','Total Dibayar','Sisa','Status','Nota']
                          .map((h,i) => (
                            <th key={i} className={`px-2.5 py-2 font-bold border-b border-slate-200 dark:border-slate-700 ${i>=7&&i<=9?'text-right':''}`}>{h}</th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((d, i) => {
                        const st = statusTagihan(d.total_harga, d.dibayar);
                        return (
                          <tr key={d.id} className="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                            <td className="px-2.5 py-2 text-center text-slate-400 dark:text-slate-500">{i+1}</td>
                            <td className="px-2.5 py-2 font-semibold text-amber-600 dark:text-amber-400">{d.kendaraan}</td>
                            <td className="px-2.5 py-2 text-slate-500 dark:text-slate-400">{fmtDate(d.tanggal)}</td>
                            <td className="px-2.5 py-2 text-slate-500 dark:text-slate-400">{d.approval_at ? fmtDate(d.approval_at) : '—'}</td>
                            <td className="px-2.5 py-2 text-slate-500 dark:text-slate-400">{d.tanggal_bayar ? fmtDate(d.tanggal_bayar) : '—'}</td>
                            <td className="px-2.5 py-2 font-semibold text-slate-700 dark:text-slate-200">
                              <Link to={`/submissions/${d.id}`} className="hover:text-amber-600 dark:hover:text-amber-400 hover:underline">{d.nomor_pengajuan}</Link>
                            </td>
                            <td className="px-2.5 py-2 text-slate-600 dark:text-slate-300 whitespace-normal min-w-[180px]">{d.jenis_pembelian || '—'}</td>
                            <td className="px-2.5 py-2 text-right tabular-nums">{fmtCurrency(d.total_harga)}</td>
                            <td className="px-2.5 py-2 text-right tabular-nums">{fmtCurrency(d.dibayar)}</td>
                            <td className="px-2.5 py-2 text-right tabular-nums">{st.sisa ? fmtCurrency(st.sisa) : '—'}</td>
                            <td className="px-2.5 py-2">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                            </td>
                           <td className="px-2.5 py-2">
                              {d.nota_url
                                ? <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">✓ {d.nota_uploaded_at ? fmtDate(d.nota_uploaded_at) : 'Ada'}</span>
                                : <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400">Belum ada</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-emerald-50/60 dark:bg-emerald-500/10 font-black text-slate-700 dark:text-slate-200 border-t-2 border-slate-200 dark:border-slate-700">
                        <td colSpan={7} className="px-2.5 py-2.5">TOTAL</td>
                        <td className="px-2.5 py-2.5 text-right tabular-nums">{fmtCurrency(tTagihan)}</td>
                        <td className="px-2.5 py-2.5 text-right tabular-nums">{fmtCurrency(tBayar)}</td>
                        <td className="px-2.5 py-2.5 text-right tabular-nums">{fmtCurrency(tSisa)}</td>
                        <td></td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {/* Ringkasan cabang */}
                <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Total Tagihan: <strong className="text-slate-800 dark:text-slate-100">{fmtCurrency(tTagihan)}</strong></span>
                  <span className="text-slate-500 dark:text-slate-400">Sudah Dibayar: <strong className="text-emerald-600 dark:text-emerald-400">{fmtCurrency(tBayar)}</strong></span>
                  <span className="text-slate-500 dark:text-slate-400">Belum Dibayar: <strong className="text-red-500 dark:text-red-400">{fmtCurrency(tTagihan - tBayar)}</strong></span>
                  {noNota > 0 && <span className="text-slate-500 dark:text-slate-400">Belum ada nota: <strong className="text-red-500 dark:text-red-400">{noNota} pengajuan</strong></span>}
                </div>
                </>)}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
