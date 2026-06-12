// src/pages/VehiclesPage.jsx — v10 (Master Data Kendaraan)
// Daftar master kendaraan + preview laporan per plat + export Excel
// Akses: Admin, Verifikator, Approval, Kepala Operasional (Operasional biasa: ditolak)
import { useState, useEffect, useCallback } from 'react';
import {
  Truck, Search, Download, Plus, Pencil, X, Loader,
  FileSpreadsheet, ShieldOff, ChevronLeft, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { vehicleAPI } from '../utils/api';
import { Card, Spinner, Button, fmtCurrency, fmtDate } from '../components/ui';
import useAuthStore from '../context/authStore';

const KATEGORI = ['Sewa', 'Service', 'Ban', 'Izin Kendaraan', 'Lainnya'];
const thisYear = new Date().getFullYear();
const YEARS = [thisYear, thisYear - 1, thisYear - 2];

export default function VehiclesPage() {
  const { user } = useAuthStore();
  const allowed = ['Admin', 'Verifikator', 'Approval'].includes(user?.role)
    || user?.jabatan === 'Kepala Operasional';

  const [vehicles, setVehicles]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [year, setYear]           = useState(thisYear);
  const [q, setQ]                 = useState('');
  const [exporting, setExporting] = useState('');     // '' | 'all' | plat
  const [detail, setDetail]       = useState(null);   // { plat } → mode laporan
  const [editing, setEditing]     = useState(null);   // vehicle obj → modal edit
  const [adding, setAdding]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await vehicleAPI.list(year);
      setVehicles(data.data || []);
    } catch { toast.error('Gagal memuat master kendaraan'); }
    finally { setLoading(false); }
  }, [year]);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  if (!allowed) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <ShieldOff size={28} className="text-red-400"/>
        </div>
        <h2 className="text-lg font-black text-slate-800 mb-2">Akses Ditolak</h2>
        <p className="text-sm text-slate-400">
          Halaman Master Kendaraan hanya untuk Admin, Verifikator, Approval, dan Kepala Operasional.
        </p>
      </div>
    );
  }

  const filtered = vehicles.filter(v =>
    !q.trim() || v.plat.toLowerCase().includes(q.trim().toLowerCase())
    || (v.cabang || '').toLowerCase().includes(q.trim().toLowerCase()));

  const doExport = async (plat = '') => {
    setExporting(plat || 'all');
    try {
      await vehicleAPI.exportExcel(year, plat);
      toast.success('Excel berhasil diunduh');
    } catch (err) {
      toast.error(err?.response?.status === 404
        ? `Tidak ada transaksi pada ${year}`
        : 'Gagal export Excel');
    } finally { setExporting(''); }
  };

  if (detail) return (
    <ReportView plat={detail.plat} year={year}
      onBack={() => setDetail(null)}
      onExport={() => doExport(detail.plat)}
      exporting={exporting === detail.plat}/>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Truck size={20} className="text-amber-500"/>
          <h1 className="text-lg font-black text-slate-800">Master Kendaraan</h1>
        </div>
        <span className="text-xs text-slate-400">{filtered.length} kendaraan</span>
        <div className="ml-auto flex items-center gap-2">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-amber-400 bg-white">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {user.role === 'Admin' && (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <Plus size={14}/> Tambah
            </Button>
          )}
          <Button onClick={() => doExport('')} loading={exporting === 'all'}>
            <FileSpreadsheet size={14}/> Export Semua
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"/>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari plat atau cabang..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-amber-400 placeholder:text-slate-300"/>
      </div>

      <p className="text-[11px] text-slate-400 italic">
        Plat baru otomatis terdaftar saat pengajuan dibuat. Laporan & export hanya menghitung
        pengajuan berstatus <b>Disetujui / Selesai</b> pada tahun terpilih.
      </p>

      {/* List */}
      {loading ? <div className="py-16 flex justify-center"><Spinner size={28}/></div> : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map(v => (
            <Card key={v.id || v.plat} className="hover:border-amber-300 transition-colors border border-transparent">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-black text-slate-800">{v.plat}</p>
                  <p className="text-[11px] text-slate-400">
                    {v.jenis || '—'} {v.cabang ? `• ${v.cabang}` : ''}
                    {!v.is_active && <span className="text-red-400 font-semibold"> • NONAKTIF</span>}
                  </p>
                </div>
                {user.role === 'Admin' && (
                  <button onClick={() => setEditing(v)} className="text-slate-300 hover:text-amber-500">
                    <Pencil size={14}/>
                  </button>
                )}
              </div>
              <div className="flex items-end justify-between mt-3">
                <div className="text-[11px] text-slate-400">
                  <span className="font-bold text-slate-600">{v.pengajuan_count}</span> pengajuan • {year}
                  <p className="font-bold text-amber-500 text-sm">{fmtCurrency(v.total_biaya)}</p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setDetail({ plat: v.plat })}
                    className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">
                    Laporan
                  </button>
                  <button onClick={() => doExport(v.plat)} disabled={exporting === v.plat}
                    className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center gap-1 disabled:opacity-50">
                    {exporting === v.plat ? <Loader size={11} className="animate-spin"/> : <Download size={11}/>}
                    Excel
                  </button>
                </div>
              </div>
            </Card>
          ))}
          {!filtered.length && (
            <p className="col-span-2 text-center text-sm text-slate-400 py-10">
              Belum ada kendaraan {q ? 'yang cocok dengan pencarian' : 'terdaftar'}.
            </p>
          )}
        </div>
      )}

      {(adding || editing) && (
        <VehicleModal vehicle={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); load(); }}/>
      )}
    </div>
  );
}

/* ── Preview laporan satu plat (mengikuti kolom Excel perusahaan) ── */
function ReportView({ plat, year, onBack, onExport, exporting }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await vehicleAPI.report(plat, year);
        setData(res.data.data);
      } catch { toast.error('Gagal memuat laporan'); }
      finally { setLoading(false); }
    })();
  }, [plat, year]);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-600"><ChevronLeft size={20}/></button>
        <div>
          <h1 className="text-lg font-black text-slate-800">Laporan {plat}</h1>
          <p className="text-[11px] text-slate-400">Periode Januari – Desember {year}</p>
        </div>
        <div className="ml-auto">
          <Button onClick={onExport} loading={exporting}>
            <FileSpreadsheet size={14}/> Export Excel
          </Button>
        </div>
      </div>

      {loading ? <div className="py-16 flex justify-center"><Spinner size={28}/></div> : !data ? null : (
        <>
          <Card padding={false} className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  {['No','No PR','Pemakaian','Sewa','Service','Ban','Izin','Lainnya','KM','Selisih','Keterangan']
                    .map(h => <th key={h} className="px-2 py-2 font-bold text-left whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 text-slate-400">{i + 1}</td>
                    <td className="px-2 py-1.5 font-semibold">{r.no_pr || '—'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(r.tanggal)}</td>
                    {KATEGORI.map(k => (
                      <td key={k} className="px-2 py-1.5 text-right tabular-nums">
                        {r.kategori === k ? fmtCurrency(r.biaya) : ''}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.km != null ? r.km.toLocaleString('id-ID') : ''}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${r.selisih_km > 0 ? 'text-emerald-600' : ''}`}>
                      {r.selisih_km != null ? `+${r.selisih_km.toLocaleString('id-ID')}` : ''}
                    </td>
                    <td className="px-2 py-1.5">{r.keterangan}</td>
                  </tr>
                ))}
                {!data.rows.length && (
                  <tr><td colSpan={11} className="text-center text-slate-400 py-8">
                    Tidak ada transaksi Disetujui/Selesai pada {year}.
                  </td></tr>
                )}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-black bg-amber-50/50">
                    <td colSpan={3} className="px-2 py-2">TOTAL</td>
                    {KATEGORI.map(k => (
                      <td key={k} className="px-2 py-2 text-right tabular-nums text-amber-600">
                        {data.totals[k] ? fmtCurrency(data.totals[k]) : '—'}
                      </td>
                    ))}
                    <td colSpan={3}/>
                  </tr>
                </tfoot>
              )}
            </table>
          </Card>
          <p className="text-[10px] text-slate-400 italic">
            Format mengikuti FORM LAPORAN perusahaan. File Excel berisi header
            (No. Polisi, Pemilik, Periode, STNK, Pajak), tabel ini, total per kategori,
            ringkasan biaya, dan blok tanda tangan.
          </p>
        </>
      )}
    </div>
  );
}

/* ── Modal tambah/edit kendaraan (Admin) ── */
function VehicleModal({ vehicle, onClose, onSaved }) {
  const isEdit = !!vehicle;
  const [f, setF] = useState({
    plat: vehicle?.plat || '', pemilik: vehicle?.pemilik || '',
    stnk: vehicle?.stnk || '', pajak: vehicle?.pajak || '',
    jenis: vehicle?.jenis || '', cabang: vehicle?.cabang || '',
    keterangan: vehicle?.keterangan || '', is_active: vehicle?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const save = async () => {
    if (!isEdit && !f.plat.trim()) { toast.error('Plat wajib diisi'); return; }
    setSaving(true);
    try {
      if (isEdit) await vehicleAPI.update(vehicle.id, f);
      else        await vehicleAPI.create(f);
      toast.success(isEdit ? 'Kendaraan diperbarui' : 'Kendaraan ditambahkan');
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan');
    } finally { setSaving(false); }
  };

  const Field = ({ label, k, ph }) => (
    <div>
      <label className="text-[11px] font-bold text-slate-500">{label}</label>
      <input value={f[k]} onChange={e => set(k, e.target.value)} placeholder={ph || ''}
        className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-amber-400 placeholder:text-slate-300"/>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-black text-slate-800">{isEdit ? `Edit ${vehicle.plat}` : 'Tambah Kendaraan'}</h3>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500"><X size={18}/></button>
        </div>
        {!isEdit && <Field label="Plat Nomor *" k="plat" ph="BM 1234 AA"/>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jenis" k="jenis" ph="Supertruck"/>
          <Field label="Cabang" k="cabang" ph="APL PKU"/>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Pemilik" k="pemilik"/>
          <Field label="STNK" k="stnk"/>
          <Field label="Pajak" k="pajak"/>
        </div>
        <Field label="Keterangan" k="keterangan"/>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={f.is_active} onChange={e => set('is_active', e.target.checked)}
              className="accent-amber-500"/>
            Kendaraan aktif (ikut dalam Export Semua)
          </label>
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Batal</Button>
          <Button className="flex-1" onClick={save} loading={saving}>Simpan</Button>
        </div>
      </div>
    </div>
  );
}
