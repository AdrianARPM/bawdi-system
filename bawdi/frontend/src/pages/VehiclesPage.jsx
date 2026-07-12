// src/pages/VehiclesPage.jsx — v20 (Super Track — Dark Mode Tahap 5, hanya varian dark:, basis v19)
// v19: laporan menampilkan No PR LENGKAP + kolom Nama Pemohon (setelah No PR).
// v14: akses lihat dibuka utk semua user login (edit tetap Admin).
// Daftar master kendaraan + preview laporan per plat + export Excel
// Akses: Admin, Verifikator, Approval, Kepala Operasional (Operasional biasa: ditolak)
import { useState, useEffect, useCallback } from 'react';
import {
  Truck, Search, Download, Plus, Pencil, X, Loader, Trash2,
  FileSpreadsheet, ChevronLeft, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { vehicleAPI } from '../utils/api';
import { Card, Spinner, Button, Input, Textarea, fmtCurrency, fmtDate } from '../components/ui';
import useAuthStore from '../context/authStore';

const KATEGORI = ['Sewa', 'Service', 'Ban', 'Izin Kendaraan', 'Jasa', 'Lainnya'];
const thisYear = new Date().getFullYear();
const YEARS = [thisYear, thisYear - 1, thisYear - 2];

export default function VehiclesPage() {
  const { user } = useAuthStore();
  // v14: Master Kendaraan dapat DILIHAT semua user login.
  //      Tambah/Edit kendaraan tetap khusus Admin (dicek per-tombol di bawah).
  const allowed = !!user;

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
    } catch { toast.error('Gagal memuat super track'); }
    finally { setLoading(false); }
  }, [year]);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

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
    <ReportView plat={detail.plat} year={year} user={user}
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
          <h1 className="text-lg font-black text-slate-800 dark:text-slate-100">Super Track</h1>
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500">{filtered.length} kendaraan</span>
        <div className="ml-auto flex items-center gap-2">
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm outline-none focus:border-amber-400 bg-white dark:bg-slate-900">
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
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600"/>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari plat atau cabang..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm dark:bg-slate-900 outline-none focus:border-amber-400 placeholder:text-slate-300 dark:placeholder:text-slate-600"/>
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
        Plat baru otomatis terdaftar saat pengajuan dibuat. Laporan & export hanya menghitung
        pengajuan berstatus <b>Disetujui / Selesai</b> pada tahun terpilih.
      </p>

      {/* List */}
      {loading ? <div className="py-16 flex justify-center"><Spinner size={28}/></div> : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map(v => (
            <Card key={v.id || v.plat} className="hover:border-amber-300 dark:hover:border-amber-500/40 transition-colors border border-transparent">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-black text-slate-800 dark:text-slate-100">{v.plat}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {v.jenis || '—'} {v.cabang ? `• ${v.cabang}` : ''}
                    {!v.is_active && <span className="text-red-400 font-semibold"> • NONAKTIF</span>}
                  </p>
                </div>
                {user.role === 'Admin' && (
                  <button onClick={() => setEditing(v)} className="text-slate-300 dark:text-slate-600 hover:text-amber-500">
                    <Pencil size={14}/>
                  </button>
                )}
              </div>
              <div className="flex items-end justify-between mt-3">
                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                  <span className="font-bold text-slate-600 dark:text-slate-300">{v.pengajuan_count}</span> pengajuan • {year}
                  <p className="font-bold text-amber-500 text-sm">{fmtCurrency(v.total_biaya)}</p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setDetail({ plat: v.plat })}
                    className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
                    Laporan
                  </button>
                  <button onClick={() => doExport(v.plat)} disabled={exporting === v.plat}
                    className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 flex items-center gap-1 disabled:opacity-50">
                    {exporting === v.plat ? <Loader size={11} className="animate-spin"/> : <Download size={11}/>}
                    Excel
                  </button>
                </div>
              </div>
            </Card>
          ))}
          {!filtered.length && (
            <p className="col-span-2 text-center text-sm text-slate-400 dark:text-slate-500 py-10">
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
function ReportView({ plat, year, onBack, onExport, exporting, user }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [kkModal, setKkModal] = useState(null);   // null | {} (tambah) | row (edit)

  const canInput = ['Admin', 'Verifikator', 'Operasional'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vehicleAPI.report(plat, year);
      setData(res.data.data);
    } catch { toast.error('Gagal memuat laporan'); }
    finally { setLoading(false); }
  }, [plat, year]);

  useEffect(() => { load(); }, [load]);

  const delKasKecil = async (row) => {
    if (!window.confirm('Hapus entri kas kecil ini?')) return;
    try {
      await vehicleAPI.deleteKasKecil(row.kas_id);
      toast.success('Kas kecil dihapus');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menghapus');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"><ChevronLeft size={20}/></button>
        <div>
          <h1 className="text-lg font-black text-slate-800 dark:text-slate-100">Laporan {plat}</h1>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">Periode Januari – Desember {year}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canInput && (
            <Button variant="secondary" onClick={() => setKkModal({})}>
              <Plus size={14}/> Input Kas Kecil
            </Button>
          )}
          <Button onClick={onExport} loading={exporting}>
            <FileSpreadsheet size={14}/> Export Excel
          </Button>
        </div>
      </div>

      {loading ? <div className="py-16 flex justify-center"><Spinner size={28}/></div> : !data ? null : (
        <>
          <Card padding={false} className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead className="border border-slate-200 dark:border-slate-700">
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                {['No','No PR','Nama Pemohon','Tanggal','Sewa','Service','Ban','Izin','Jasa','Lainnya','KM Pengajuan','Selisih','Keterangan']
              .map(h => (
              <th
                key={h}
                className="px-2 py-2 font-bold text-left whitespace-nowrap border border-slate-200 dark:border-slate-700">
                    {h}
              </th>))}
              </tr>
            </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={r.kas_id || i} className={`border-t border-slate-100 dark:border-slate-800 ${r.is_kas_kecil ? 'bg-amber-50/40 dark:bg-amber-500/5' : ''}`}>
                    <td className="px-2 py-1.5 text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-slate-700">{i + 1}</td>
                    <td className="px-2 py-1.5 font-semibold whitespace-nowrap border-r border-slate-200 dark:border-slate-700">
                      {r.is_kas_kecil
                        ? <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-bold">Kas Kecil</span>
                        : (r.no_pr || '—')}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap border-r border-slate-200 dark:border-slate-700">{r.nama_pemohon || '—'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap border-r border-slate-200 dark:border-slate-700">{fmtDate(r.tanggal)}</td>
                    {KATEGORI.map(k => (
                      <td key={k} className="px-2 py-1.5 text-right tabular-nums border-r border-slate-200 dark:border-slate-700">
                        {r.kategori === k ? fmtCurrency(r.biaya) : ''}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right tabular-nums border-r border-slate-200 dark:border-slate-700">{r.km != null ? r.km.toLocaleString('id-ID') : ''}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums border-r border-slate-200 dark:border-slate-700 ${r.selisih_km > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                      {r.selisih_km != null ? `${r.selisih_km > 0 ? '+' : ''}${r.selisih_km.toLocaleString('id-ID')}` : ''}
                    </td>
                    <td className="px-2 py-1.5 border-r border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between gap-2">
                        <span>{r.keterangan}</span>
                        {r.is_kas_kecil && canInput && (
                          <span className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => setKkModal(r)} className="text-slate-400 dark:text-slate-500 hover:text-amber-500" title="Edit">
                              <Pencil size={12}/>
                            </button>
                            <button onClick={() => delKasKecil(r)} className="text-slate-400 dark:text-slate-500 hover:text-red-500" title="Hapus">
                              <Trash2 size={12}/>
                            </button>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!data.rows.length && (
                  <tr><td colSpan={13} className="text-center text-slate-400 dark:text-slate-500 py-8">
                    Tidak ada transaksi Disetujui/Selesai pada {year}.
                  </td></tr>
                )}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-black bg-amber-50/50 dark:bg-amber-500/10">
                    <td colSpan={4} className="px-2 py-2">TOTAL</td>
                    {KATEGORI.map(k => (
                      <td key={k} className="px-2 py-2 text-right tabular-nums text-amber-600 dark:text-amber-400">
                        {data.totals[k] ? fmtCurrency(data.totals[k]) : '—'}
                      </td>
                    ))}
                    <td colSpan={3}/>
                  </tr>
                </tfoot>
              )}
            </table>
          </Card>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">
            Format mengikuti FORM LAPORAN super track perusahaan.
          </p>
        </>
      )}

      {kkModal && (
        <KasKecilModal
          plat={plat}
          user={user}
          editRow={kkModal.kas_id ? kkModal : null}
          onClose={() => setKkModal(null)}
          onSaved={() => { setKkModal(null); load(); }}/>
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
      <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{label}</label>
      <input value={f[k]} onChange={e => set(k, e.target.value)} placeholder={ph || ''}
        className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm dark:bg-slate-900 outline-none focus:border-amber-400 placeholder:text-slate-300 dark:placeholder:text-slate-600"/>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-black text-slate-800 dark:text-slate-100">{isEdit ? `Edit ${vehicle.plat}` : 'Tambah Kendaraan'}</h3>
          <button onClick={onClose} className="text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400"><X size={18}/></button>
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
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
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

/* ── Modal input/edit Kas Kecil (Admin/Verifikator/Operasional) ── */
function KasKecilModal({ plat, user, editRow, onClose, onSaved }) {
  const isEdit = !!editRow;
  const toDateInput = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    return isNaN(d) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
  };
  const [f, setF] = useState({
    tanggal:        toDateInput(editRow?.tanggal),
    kategori_biaya: editRow?.kategori || 'Lainnya',
    keterangan:     editRow?.keterangan || '',
    harga:          editRow?.biaya != null ? String(editRow.biaya) : '',
    km:             editRow?.km != null ? String(editRow.km) : '',
    selisih_manual: editRow?.selisih_override != null ? String(editRow.selisih_override) : '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const save = async () => {
    if (!f.keterangan.trim()) { toast.error('Rincian/keterangan wajib diisi'); return; }
    setSaving(true);
    const payload = {
      plat,
      tanggal: f.tanggal,
      keterangan: f.keterangan.trim(),
      kategori_biaya: f.kategori_biaya,
      harga: Number(f.harga) || 0,
      km: f.km === '' ? null : Number(f.km),
      selisih_manual: f.selisih_manual === '' ? null : Number(f.selisih_manual),
    };
    try {
      if (isEdit) await vehicleAPI.updateKasKecil(editRow.kas_id, payload);
      else        await vehicleAPI.createKasKecil(payload);
      toast.success(isEdit ? 'Kas kecil diperbarui' : 'Kas kecil ditambahkan');
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-black text-slate-800 dark:text-slate-100">{isEdit ? 'Edit Kas Kecil' : 'Input Kas Kecil'}</h3>
          <button onClick={onClose} className="text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400"><X size={18}/></button>
        </div>

        <div className="text-[11px] bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2 text-slate-500 dark:text-slate-400">
          Plat <b className="text-slate-700 dark:text-slate-200">{plat}</b> • Dicatat atas nama <b className="text-slate-700 dark:text-slate-200">{user?.name || '—'}</b>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Tanggal</label>
            <input type="date" value={f.tanggal} onChange={e => set('tanggal', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 dark:bg-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-500/20"/>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Kategori</label>
            <select value={f.kategori_biaya} onChange={e => set('kategori_biaya', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-500/20 bg-white dark:bg-slate-900">
              {KATEGORI.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>

        <Textarea label="Rincian / Keterangan *" rows={2} value={f.keterangan}
          onChange={e => set('keterangan', e.target.value)} placeholder="mis. Jasa perbaikan lampu depan"/>

        <div className="grid grid-cols-3 gap-3">
          <Input label="Harga (Rp)" type="number" inputMode="numeric" value={f.harga}
            onChange={e => set('harga', e.target.value)} placeholder="0"/>
          <Input label="KM" type="number" inputMode="numeric" value={f.km}
            onChange={e => set('km', e.target.value)} placeholder="opsional"/>
          <Input label="Selisih KM" type="number" inputMode="numeric" value={f.selisih_manual}
            onChange={e => set('selisih_manual', e.target.value)} placeholder="otomatis"/>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 -mt-1">
          Selisih KM kosong = dihitung otomatis dari riwayat item yang sama. Isi hanya bila ingin menimpa manual.
        </p>

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Batal</Button>
          <Button className="flex-1" onClick={save} loading={saving}>Simpan</Button>
        </div>
      </div>
    </div>
  );
}
