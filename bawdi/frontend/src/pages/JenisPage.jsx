// src/pages/JenisPage.jsx — Master Jenis Pembelian / Beban (Admin)
import { useState, useEffect } from 'react';
import { Tags, Plus, ToggleLeft, ToggleRight, Pencil, Truck, Building2, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { jenisAPI } from '../utils/api';
import { Card, Spinner, Empty, Button, Input } from '../components/ui';

const BLANK = { nama: '', for_kendaraan: true, for_umum: false, pph23_wajib: false, urutan: '' };

function Toggle({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
        on ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
           : 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'}`}>
      <span className={`w-8 h-4 rounded-full flex-shrink-0 relative transition-colors ${on ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`}/>
      </span>
      {children}
    </button>
  );
}

export default function JenisPage() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId,  setEditId]  = useState(null);
  const [form,    setForm]    = useState(BLANK);

  const load = async () => {
    try {
      const { data } = await jenisAPI.list(true);        // ?all=1 → termasuk nonaktif
      setRows(data.data || []);
    } catch { toast.error('Gagal memuat master jenis pembelian'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openAdd  = () => { setEditId(null); setForm(BLANK); setShowForm(true); };
  const openEdit = (j) => {
    setEditId(j.id);
    setForm({ nama: j.nama, for_kendaraan: !!j.for_kendaraan, for_umum: !!j.for_umum,
              pph23_wajib: !!j.pph23_wajib, urutan: j.urutan ?? '' });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditId(null); setForm(BLANK); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nama.trim()) { toast.error('Nama jenis wajib diisi'); return; }
    if (!form.for_kendaraan && !form.for_umum) { toast.error('Pilih minimal satu konteks: Kendaraan atau Umum'); return; }
    setSaving(true);
    try {
      if (editId) {
        const { data } = await jenisAPI.update(editId, form);
        toast.success(data.message);
      } else {
        const { data } = await jenisAPI.create(form);
        toast.success(data.message);
      }
      closeForm();
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan jenis');
    }
    setSaving(false);
  };

  const handleToggle = async (j) => {
    try {
      await jenisAPI.update(j.id, { is_active: !j.is_active });
      toast.success(`${j.nama} di${j.is_active ? 'nonaktifkan' : 'aktifkan'}`);
      await load();
    } catch { toast.error('Gagal memperbarui status'); }
  };

  if (loading) return <Spinner size={32} />;

  const aktif = rows.filter(j => j.is_active).length;
  const pphCount = rows.filter(j => j.pph23_wajib).length;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">Master Jenis Pembelian</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
            {rows.length} jenis · {aktif} aktif · {pphCount} wajib PPh23
          </p>
        </div>
        <Button onClick={showForm ? closeForm : openAdd}>
          <Plus size={15} /> Tambah Jenis
        </Button>
      </div>

      {/* Form Tambah / Edit */}
      {showForm && (
        <Card className="animate-fade-in border-amber-200 dark:border-amber-500/30">
          <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-800">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {editId ? 'Edit Jenis Pembelian' : 'Tambah Jenis Pembelian'}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Input label="Nama Jenis *" value={form.nama}
                  onChange={e => set('nama', e.target.value)} placeholder="Contoh: Beban Perbaikan" />
              </div>
              <Input label="Urutan" type="number" value={form.urutan}
                onChange={e => set('urutan', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Muncul di konteks</label>
              <div className="flex flex-wrap gap-2">
                <Toggle on={form.for_kendaraan} onClick={() => set('for_kendaraan', !form.for_kendaraan)}><Truck size={13}/> Kendaraan</Toggle>
                <Toggle on={form.for_umum} onClick={() => set('for_umum', !form.for_umum)}><Building2 size={13}/> Umum / Kantor</Toggle>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Aturan pajak</label>
              <Toggle on={form.pph23_wajib} onClick={() => set('pph23_wajib', !form.pph23_wajib)}><Receipt size={13}/> Wajib isi PPh23</Toggle>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
                Bila aktif, pemohon wajib mengisi kolom PPh23 saat memilih jenis ini.
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" type="button" onClick={closeForm} className="flex-1">Batal</Button>
              <Button type="submit" loading={saving} className="flex-1">
                {editId ? 'Simpan Perubahan' : 'Simpan Jenis'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* List */}
      {rows.length === 0 && (
        <Empty icon={Tags} message="Belum ada jenis pembelian" sub="Klik 'Tambah Jenis' untuk menambahkan." />
      )}

      <Card padding={false}>
        {rows.map((j, i) => (
          <div key={j.id}
            className={`flex items-center gap-3 px-4 py-2.5 ${i < rows.length - 1 ? 'border-b border-slate-50 dark:border-slate-800' : ''} ${!j.is_active ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{j.nama}</p>
                {j.pph23_wajib && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex-shrink-0">PPh23</span>
                )}
                {!j.is_active && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex-shrink-0">Nonaktif</span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-2">
                {j.for_kendaraan && <span className="inline-flex items-center gap-1"><Truck size={11}/> Kendaraan</span>}
                {j.for_umum && <span className="inline-flex items-center gap-1"><Building2 size={11}/> Umum</span>}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => openEdit(j)} title="Edit"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10">
                <Pencil size={13} />
              </button>
              <button onClick={() => handleToggle(j)} title={j.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                {j.is_active
                  ? <ToggleRight size={15} className="text-emerald-500" />
                  : <ToggleLeft size={15} className="text-slate-400 dark:text-slate-500" />}
              </button>
            </div>
          </div>
        ))}
      </Card>

      {/* Info box */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-2xl p-4">
        <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
          Daftar ini menggantikan daftar jenis yang dulu ditanam di kode. Flag <strong>Wajib PPh23</strong>
          kini jadi satu sumber aturan — dipakai form pengajuan <em>dan</em> validasi server, jadi tidak
          bisa lagi beda antara frontend & backend.
        </p>
      </div>
    </div>
  );
}
