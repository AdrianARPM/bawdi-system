// src/pages/VendorPage.jsx — Master Data Vendor / Supplier (Admin)
import { useState, useEffect } from 'react';
import { Store, Plus, ToggleLeft, ToggleRight, Pencil, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { vendorAPI } from '../utils/api';
import { Card, Spinner, Empty, Button, Input } from '../components/ui';

const BLANK = { nama: '', npwp: '', bank: '', no_rekening: '', atas_nama: '', telepon: '', alamat: '' };

export default function VendorPage() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId,  setEditId]  = useState(null);
  const [form,    setForm]    = useState(BLANK);
  const [cari,    setCari]    = useState('');
  const [page,    setPage]    = useState(1);
  const PER_PAGE = 12;

  const load = async () => {
    try {
      const { data } = await vendorAPI.list(true);       // ?all=1 → termasuk nonaktif
      setRows(data.data || []);
    } catch { toast.error('Gagal memuat master vendor'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openAdd  = () => { setEditId(null); setForm(BLANK); setShowForm(true); };
  const openEdit = (v) => {
    setEditId(v.id);
    setForm({ nama: v.nama || '', npwp: v.npwp || '', bank: v.bank || '',
              no_rekening: v.no_rekening || '', atas_nama: v.atas_nama || '',
              telepon: v.telepon || '', alamat: v.alamat || '' });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(BLANK); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nama.trim()) { toast.error('Nama vendor wajib diisi'); return; }
    setSaving(true);
    try {
      if (editId) {
        const { data } = await vendorAPI.update(editId, form);
        toast.success(data.message);
      } else {
        const { data } = await vendorAPI.create(form);
        toast.success(data.message);
      }
      closeForm();
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan vendor');
    }
    setSaving(false);
  };

  const handleToggle = async (v) => {
    try {
      await vendorAPI.update(v.id, { is_active: !v.is_active });
      toast.success(`${v.nama} di${v.is_active ? 'nonaktifkan' : 'aktifkan'}`);
      await load();
    } catch { toast.error('Gagal memperbarui status'); }
  };

  if (loading) return <Spinner size={32} />;

  const q = cari.trim().toLowerCase();
  const filtered = q
    ? rows.filter(v => [v.nama, v.npwp, v.bank, v.no_rekening, v.atas_nama]
        .some(x => (x || '').toLowerCase().includes(q)))
    : rows;
  const aktif = rows.filter(v => v.is_active).length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const curPage    = Math.min(page, totalPages);           // jaga-jaga bila filter mengecil
  const pageRows   = filtered.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">Master Vendor / Supplier</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
            {rows.length} vendor · {aktif} aktif
          </p>
        </div>
        <Button onClick={showForm ? closeForm : openAdd}>
          <Plus size={15} /> Tambah Vendor
        </Button>
      </div>

      {/* Form Tambah / Edit */}
      {showForm && (
        <Card className="animate-fade-in border-amber-200 dark:border-amber-500/30">
          <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-800">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {editId ? `Edit Vendor` : 'Tambah Vendor Baru'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              NPWP & rekening akan terisi otomatis di form pengajuan saat vendor ini dipilih.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <Input label="Nama Vendor *" value={form.nama}
              onChange={e => set('nama', e.target.value)} placeholder="Contoh: CV Maju Jaya" />
            <Input label="NPWP / KTP" value={form.npwp}
              onChange={e => set('npwp', e.target.value)} placeholder="XX.XXX.XXX.X-XXX.XXX (opsional)" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Bank" value={form.bank}
                onChange={e => set('bank', e.target.value)} placeholder="Contoh: BCA" />
              <Input label="No. Rekening" value={form.no_rekening}
                onChange={e => set('no_rekening', e.target.value)} placeholder="1234567890" />
            </div>
            <Input label="Atas Nama (pemilik rekening)" value={form.atas_nama}
              onChange={e => set('atas_nama', e.target.value)} placeholder="Nama pemilik rekening" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Telepon" value={form.telepon}
                onChange={e => set('telepon', e.target.value)} placeholder="No. telepon (opsional)" />
              <Input label="Alamat" value={form.alamat}
                onChange={e => set('alamat', e.target.value)} placeholder="Alamat (opsional)" />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" type="button" onClick={closeForm} className="flex-1">Batal</Button>
              <Button type="submit" loading={saving} className="flex-1">
                {editId ? 'Simpan Perubahan' : 'Simpan Vendor'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Pencarian */}
      {rows.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={cari} onChange={e => { setCari(e.target.value); setPage(1); }}
            placeholder="Cari nama / NPWP / rekening..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20" />
        </div>
      )}

      {/* List */}
      {rows.length === 0 && (
        <Empty icon={Store} message="Belum ada vendor" sub="Klik 'Tambah Vendor' untuk menambahkan." />
      )}
      {rows.length > 0 && filtered.length === 0 && (
        <Empty icon={Search} message="Tidak ada yang cocok" sub={`Tidak ada vendor untuk "${cari}"`} />
      )}

      <Card padding={false}>
        {pageRows.map((v, i) => (
          <div key={v.id}
            className={`flex items-center gap-3 px-4 py-2.5 ${i < pageRows.length - 1 ? 'border-b border-slate-50 dark:border-slate-800' : ''} ${!v.is_active ? 'opacity-50' : ''}`}>
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <Store size={15} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{v.nama}</p>
                {!v.is_active && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex-shrink-0">Nonaktif</span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                {v.npwp ? `NPWP ${v.npwp}` : 'NPWP —'}
                {' · '}{v.rekening || 'rekening —'}
                {v.pengajuan_count ? ` · ${v.pengajuan_count}×` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => openEdit(v)} title="Edit"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10">
                <Pencil size={13} />
              </button>
              <button onClick={() => handleToggle(v)}
                title={v.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                {v.is_active
                  ? <ToggleRight size={15} className="text-emerald-500" />
                  : <ToggleLeft size={15} className="text-slate-400 dark:text-slate-500" />}
              </button>
            </div>
          </div>
        ))}
      </Card>

      {/* Pagination */}
      {filtered.length > PER_PAGE && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {(curPage - 1) * PER_PAGE + 1}–{Math.min(curPage * PER_PAGE, filtered.length)} dari {filtered.length}
          </p>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={curPage <= 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft size={15} />
            </button>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 px-1.5">{curPage}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={curPage >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-2xl p-4">
        <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
          Saat membuat pengajuan, ketik nama vendor lalu pilih dari daftar — <strong>NPWP & rekening
          terisi otomatis</strong>. Pemohon tetap bisa mengetik vendor baru yang belum terdaftar;
          Admin lalu menambahkannya di sini agar rapi ke depannya.
        </p>
      </div>
    </div>
  );
}
