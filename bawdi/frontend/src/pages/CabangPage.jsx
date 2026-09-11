// src/pages/CabangPage.jsx — Master Data Cabang / Project (Admin)
import { useState, useEffect } from 'react';
import { Building2, Plus, ToggleLeft, ToggleRight, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { cabangAPI } from '../utils/api';
import { Card, Spinner, Empty, Button, Input } from '../components/ui';

const BLANK = { kode: '', nama: '', alamat: '', pic: '', telepon: '', urutan: '' };

export default function CabangPage() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId,  setEditId]  = useState(null);         // null = mode tambah
  const [form,    setForm]    = useState(BLANK);

  const load = async () => {
    try {
      const { data } = await cabangAPI.list(true);       // ?all=1 → termasuk nonaktif
      setRows(data.data || []);
    } catch { toast.error('Gagal memuat master cabang'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openAdd  = () => { setEditId(null); setForm(BLANK); setShowForm(true); };
  const openEdit = (c) => {
    setEditId(c.id);
    setForm({ kode: c.kode, nama: c.nama || '', alamat: c.alamat || '',
              pic: c.pic || '', telepon: c.telepon || '', urutan: c.urutan ?? '' });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(BLANK); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editId && !form.kode.trim()) { toast.error('Kode cabang wajib diisi'); return; }
    setSaving(true);
    try {
      if (editId) {
        const { nama, alamat, pic, telepon, urutan } = form;
        const { data } = await cabangAPI.update(editId, { nama, alamat, pic, telepon, urutan });
        toast.success(data.message);
      } else {
        const { data } = await cabangAPI.create(form);
        toast.success(data.message);
      }
      closeForm();
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan cabang');
    }
    setSaving(false);
  };

  const handleToggle = async (c) => {
    try {
      await cabangAPI.update(c.id, { is_active: !c.is_active });
      toast.success(`${c.kode} di${c.is_active ? 'nonaktifkan' : 'aktifkan'}`);
      await load();
    } catch { toast.error('Gagal memperbarui status'); }
  };

  if (loading) return <Spinner size={32} />;

  const aktif = rows.filter(c => c.is_active).length;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">Master Cabang / Project</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
            {rows.length} cabang · {aktif} aktif
          </p>
        </div>
        <Button onClick={showForm ? closeForm : openAdd}>
          <Plus size={15} /> Tambah Cabang
        </Button>
      </div>

      {/* Form Tambah / Edit */}
      {showForm && (
        <Card className="animate-fade-in border-amber-200 dark:border-amber-500/30">
          <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-800">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {editId ? `Edit Cabang ${form.kode}` : 'Tambah Cabang Baru'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              {editId
                ? 'Kode tidak bisa diubah karena sudah dipakai di data lama.'
                : 'Kode dipakai di nomor pengajuan (mis. APLPKU). Otomatis huruf besar.'}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Kode Cabang *" value={form.kode}
                onChange={e => set('kode', e.target.value.toUpperCase())}
                placeholder="Contoh: APLPKU" disabled={!!editId} />
              <Input label="Urutan Tampil" type="number" value={form.urutan}
                onChange={e => set('urutan', e.target.value)} placeholder="0" />
            </div>
            <Input label="Nama Cabang / Project" value={form.nama}
              onChange={e => set('nama', e.target.value)} placeholder="Contoh: APL Pekanbaru" />
            <Input label="Alamat" value={form.alamat}
              onChange={e => set('alamat', e.target.value)} placeholder="Alamat cabang (opsional)" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="PIC / Penanggung Jawab" value={form.pic}
                onChange={e => set('pic', e.target.value)} placeholder="Nama PIC (opsional)" />
              <Input label="Telepon" value={form.telepon}
                onChange={e => set('telepon', e.target.value)} placeholder="No. telepon (opsional)" />
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" type="button" onClick={closeForm} className="flex-1">Batal</Button>
              <Button type="submit" loading={saving} className="flex-1">
                {editId ? 'Simpan Perubahan' : 'Simpan Cabang'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* List */}
      {rows.length === 0 && (
        <Empty icon={Building2} message="Belum ada cabang" sub="Klik 'Tambah Cabang' untuk menambahkan." />
      )}

      <Card padding={false}>
        {rows.map((c, i) => (
          <div key={c.id}
            className={`flex items-center gap-3 px-4 py-3.5 ${i < rows.length - 1 ? 'border-b border-slate-50 dark:border-slate-800' : ''} ${!c.is_active ? 'opacity-50' : ''}`}>
            <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Building2 size={18} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-black text-slate-800 dark:text-slate-100 font-mono">{c.kode}</p>
                {!c.is_active && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">Nonaktif</span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {c.nama || <span className="italic text-slate-300 dark:text-slate-600">nama belum diisi</span>}
                {c.pic ? ` · PIC: ${c.pic}` : ''}
              </p>
              <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-0.5">
                {c.pengajuan_count} pengajuan
                {c.telepon ? ` · ${c.telepon}` : ''}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button onClick={() => openEdit(c)}
                className="flex items-center gap-1 text-[10px] font-semibold text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
                <Pencil size={11} /> Edit
              </button>
              <button onClick={() => handleToggle(c)}
                title={c.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                {c.is_active
                  ? <><ToggleRight size={16} className="text-emerald-500" /> Aktif</>
                  : <><ToggleLeft size={16} className="text-slate-400 dark:text-slate-500" /> Nonaktif</>}
              </button>
            </div>
          </div>
        ))}
      </Card>

      {/* Info box */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-2xl p-4">
        <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
          Daftar ini kini menjadi sumber tunggal cabang. Cabang <strong>aktif</strong> otomatis
          muncul di dropdown form pengajuan. Menonaktifkan cabang menyembunyikannya dari form baru
          tanpa mengganggu pengajuan lama yang sudah memakainya.
        </p>
      </div>
    </div>
  );
}
