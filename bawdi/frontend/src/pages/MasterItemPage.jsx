// src/pages/MasterItemPage.jsx — Katalog Master Item (Admin global + Operasional per-cabang)
import { useState, useEffect } from 'react';
import { Package, Plus, ToggleLeft, ToggleRight, Pencil, Search, Bike, Car, Boxes, Globe, Building2, DownloadCloud, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import { masterItemAPI, cabangAPI } from '../utils/api';
import { Card, Spinner, Empty, Button, Input } from '../components/ui';
import useAuthStore from '../context/authStore';

const KATEGORI = ['Sewa', 'Service', 'Ban', 'Izin Kendaraan', 'Jasa', 'Lainnya'];
const JENIS = [
  { v: 'motor', label: 'Motor', icon: Bike },
  { v: 'mobil', label: 'Mobil', icon: Car },
  { v: 'umum',  label: 'Umum',  icon: Boxes },
];
const jenisMeta = (v) => JENIS.find(j => j.v === v) || JENIS[2];
const BLANK = { nama: '', kategori_biaya: 'Lainnya', jenis_kendaraan: 'motor', cabang: '' };

export default function MasterItemPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'Admin';

  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId,  setEditId]  = useState(null);
  const [form,    setForm]    = useState(BLANK);
  const [cari,    setCari]    = useState('');
  const [cabangOpts, setCabangOpts] = useState([]);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    try {
      const { data } = await masterItemAPI.list({ all: 1 });
      setRows(data.data || []);
    } catch { toast.error('Gagal memuat master item'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    if (isAdmin) cabangAPI.list().then(({ data }) => setCabangOpts((data.data || []).map(c => c.kode))).catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const canEdit = (it) => isAdmin || (it.cabang && it.cabang === (user?.cabang || ''));

  const openAdd  = () => { setEditId(null); setForm(BLANK); setShowForm(true); };
  const openEdit = (it) => {
    setEditId(it.id);
    setForm({ nama: it.nama, kategori_biaya: it.kategori_biaya, jenis_kendaraan: it.jenis_kendaraan, cabang: it.cabang || '' });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(BLANK); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nama.trim()) { toast.error('Nama item wajib diisi'); return; }
    setSaving(true);
    try {
      if (editId) {
        const { data } = await masterItemAPI.update(editId, form);
        toast.success(data.message);
      } else {
        const { data } = await masterItemAPI.create(form);
        toast.success(data.message);
      }
      closeForm();
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan item');
    }
    setSaving(false);
  };

  const handleImport = async () => {
    if (!window.confirm('Import item dasar dari pengajuan lama ke katalog (sebagai Global)? Hasilnya bisa kamu rapikan/nonaktifkan setelahnya.')) return;
    setImporting(true);
    try {
      const { data } = await masterItemAPI.import();
      toast.success(data.message || 'Import selesai');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal import');
    }
    setImporting(false);
  };

  const handleToggle = async (it) => {
    try {
      await masterItemAPI.update(it.id, { is_active: !it.is_active });
      toast.success(`${it.nama} di${it.is_active ? 'nonaktifkan' : 'aktifkan'}`);
      await load();
    } catch (err) { toast.error(err.response?.data?.error || 'Gagal memperbarui'); }
  };

  if (loading) return <Spinner size={32} />;

  const q = cari.trim().toLowerCase();
  const filtered = q ? rows.filter(it => it.nama.toLowerCase().includes(q)) : rows;
  const aktif = rows.filter(it => it.is_active).length;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">Master Item</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">{rows.length} item · {aktif} aktif</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={handleImport} disabled={importing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-300 text-xs font-bold disabled:opacity-50">
              {importing ? <Loader size={13} className="animate-spin"/> : <DownloadCloud size={13}/>} Import data lama
            </button>
          )}
          <Button onClick={showForm ? closeForm : openAdd}><Plus size={15} /> Tambah Item</Button>
        </div>
      </div>

      {showForm && (
        <Card className="animate-fade-in border-amber-200 dark:border-amber-500/30">
          <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-800">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{editId ? 'Edit Item' : 'Tambah Item'}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Nama item <b>dasar</b> saja (tanpa merek). Merek/detail diisi saat membuat pengajuan.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <Input label="Nama Item Dasar *" value={form.nama}
              onChange={e => set('nama', e.target.value)} placeholder="Contoh: Oli Mesin / Ban Luar Belakang" />
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Tipe Kendaraan</label>
              <div className="flex gap-2">
                {JENIS.map(({ v, label, icon: Icon }) => (
                  <button key={v} type="button" onClick={() => set('jenis_kendaraan', v)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                      form.jenis_kendaraan === v ? 'border-amber-400 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'}`}>
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Kategori Biaya</label>
              <select value={form.kategori_biaya} onChange={e => set('kategori_biaya', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 text-sm outline-none focus:border-amber-400">
                {KATEGORI.map(k => <option key={k}>{k}</option>)}
              </select>
            </div>
            {isAdmin ? (
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Scope</label>
                <select value={form.cabang} onChange={e => set('cabang', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 text-sm outline-none focus:border-amber-400">
                  <option value="">🌐 Global (semua cabang)</option>
                  {cabangOpts.map(c => <option key={c} value={c}>Khusus {c}</option>)}
                </select>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Item ini akan tersimpan khusus cabang <b>{user?.cabang || '—'}</b>.
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" type="button" onClick={closeForm} className="flex-1">Batal</Button>
              <Button type="submit" loading={saving} className="flex-1">{editId ? 'Simpan' : 'Tambah'}</Button>
            </div>
          </form>
        </Card>
      )}

      {rows.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari item..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 text-sm outline-none focus:border-amber-400" />
        </div>
      )}

      {rows.length === 0 && <Empty icon={Package} message="Belum ada item" sub="Klik 'Tambah Item' untuk menambahkan." />}
      {rows.length > 0 && filtered.length === 0 && <Empty icon={Search} message="Tidak ada yang cocok" sub={`"${cari}"`} />}

      <Card padding={false}>
        {filtered.map((it, i) => {
          const JM = jenisMeta(it.jenis_kendaraan);
          return (
            <div key={it.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${i < filtered.length - 1 ? 'border-b border-slate-50 dark:border-slate-800' : ''} ${!it.is_active ? 'opacity-50' : ''}`}>
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <JM.icon size={15} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{it.nama}</p>
                  {!it.is_active && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex-shrink-0">Nonaktif</span>}
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span>{JM.label}</span> · <span>{it.kategori_biaya}</span> ·
                  {it.cabang
                    ? <span className="inline-flex items-center gap-0.5"><Building2 size={10}/> {it.cabang}</span>
                    : <span className="inline-flex items-center gap-0.5"><Globe size={10}/> Global</span>}
                </p>
              </div>
              {canEdit(it) ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(it)} title="Edit"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10"><Pencil size={13} /></button>
                  <button onClick={() => handleToggle(it)} title={it.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    {it.is_active ? <ToggleRight size={15} className="text-emerald-500" /> : <ToggleLeft size={15} className="text-slate-400 dark:text-slate-500" />}
                  </button>
                </div>
              ) : (
                <span className="text-[9px] text-slate-300 dark:text-slate-600 flex-shrink-0">global</span>
              )}
            </div>
          );
        })}
      </Card>

      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-2xl p-4">
        <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
          Item <b>Global</b> dikelola Admin & terlihat semua cabang. Operasional dapat menambah item
          <b> khusus cabangnya</b> (dan hanya mengubah miliknya). Di Fase berikutnya, item ini akan muncul
          sebagai pilihan saat membuat pengajuan.
        </p>
      </div>
    </div>
  );
}
