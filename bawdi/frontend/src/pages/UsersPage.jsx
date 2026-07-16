// src/pages/UsersPage.jsx — Dark Mode Tahap 5 (hanya penambahan varian dark:, tanpa perubahan fitur)
import { useState, useEffect } from 'react';
import { UserPlus, RefreshCw, ToggleLeft, ToggleRight, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { userAPI } from '../utils/api';
import { Card, Spinner, Empty, Button, Input, fmtDate } from '../components/ui';

const ROLES = ['Operasional', 'Verifikator', 'Approval', 'Admin', 'Pengawas'];
const ROLE_COLOR = {
  Operasional: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Verifikator: 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
  Approval:    'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  Admin:       'bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300',
};
const AVATAR_BG = {
  Operasional: 'bg-amber-400',
  Verifikator: 'bg-blue-500',
  Approval:    'bg-emerald-500',
  Admin:       'bg-violet-500',
};

export default function UsersPage() {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState({ nik:'', name:'', role:'Operasional', jabatan:'', cabang:'' });

  const load = async () => {
    try {
      const { data } = await userAPI.list();
      setUsers(data.data || []);
    } catch { toast.error('Gagal memuat data pengguna'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.nik || !form.name || !form.role) {
      toast.error('NIK, Nama, dan Role wajib diisi'); return;
    }
    setSaving(true);
    try {
      const { data } = await userAPI.create(form);
      toast.success(data.message);
      setForm({ nik:'', name:'', role:'Operasional', jabatan:'', cabang:'' });
      setShowForm(false);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal menambahkan pengguna');
    }
    setSaving(false);
  };

  const handleToggle = async (id, name, isActive) => {
    try {
      await userAPI.toggleActive(id);
      toast.success(`${name} berhasil di${isActive ? 'nonaktifkan' : 'aktifkan'}`);
      await load();
    } catch { toast.error('Gagal memperbarui status'); }
  };

  const handleReset = async (id, name, nik) => {
    if (!confirm(`Reset password ${name} ke NIK (${nik})?`)) return;
    try {
      await userAPI.resetPassword(id);
      toast.success(`Password ${name} direset ke NIK: ${nik}`);
    } catch { toast.error('Gagal mereset password'); }
  };

  if (loading) return <Spinner size={32} />;

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">Manajemen Pengguna</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">{users.length} pengguna terdaftar</p>
        </div>
        <Button onClick={() => setShowForm(v => !v)}>
          <UserPlus size={15} /> Tambah User
        </Button>
      </div>

      {/* Form Tambah User */}
      {showForm && (
        <Card className="animate-fade-in border-amber-200 dark:border-amber-500/30">
          <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-800">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Tambah Pengguna Baru</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Password default = NIK. Karyawan wajib ganti saat login pertama.</p>
          </div>
          <form onSubmit={handleAdd} className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="NIK Karyawan *" value={form.nik}  onChange={e => set('nik', e.target.value)}  placeholder="Contoh: 10006" />
              <Input label="Nama Lengkap *" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nama lengkap" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Role / Jabatan Sistem *</label>
                <select value={form.role} onChange={e => set('role', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 dark:bg-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20">
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <Input label="Jabatan (opsional)" value={form.jabatan} onChange={e => set('jabatan', e.target.value)} placeholder="Contoh: Driver" />
            </div>
            <Input label="Cabang / Project (opsional)" value={form.cabang} onChange={e => set('cabang', e.target.value)} placeholder="Contoh: APL BDO" />
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" type="button" onClick={() => setShowForm(false)} className="flex-1">Batal</Button>
              <Button type="submit" loading={saving} className="flex-1">Simpan Pengguna</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Stats pills */}
      <div className="flex gap-2 flex-wrap">
        {ROLES.map(r => {
          const count = users.filter(u => u.role === r).length;
          return (
            <span key={r} className={`px-3 py-1 rounded-full text-xs font-bold ${ROLE_COLOR[r]}`}>
              {r}: {count}
            </span>
          );
        })}
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400">
          Nonaktif: {users.filter(u => !u.is_active).length}
        </span>
      </div>

      {/* Users list */}
      {users.length === 0 && <Empty icon={Users} message="Belum ada pengguna" sub="Klik 'Tambah User' untuk menambahkan pengguna baru" />}

      <Card padding={false}>
        {users.map((u, i) => (
          <div key={u.id}
            className={`flex items-center gap-3 px-4 py-3.5 ${i < users.length - 1 ? 'border-b border-slate-50 dark:border-slate-800' : ''} ${!u.is_active ? 'opacity-50' : ''}`}>

            {/* Avatar */}
            <div className={`w-10 h-10 rounded-full ${AVATAR_BG[u.role] || 'bg-slate-400'} flex items-center justify-center flex-shrink-0`}>
              <span className="text-white text-xs font-black">
                {u.name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()}
              </span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{u.name}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ROLE_COLOR[u.role]}`}>{u.role}</span>
                {!u.is_active && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">Nonaktif</span>}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                NIK: <strong>{u.nik}</strong>
                {u.jabatan ? ` · ${u.jabatan}` : ''}
                {u.cabang  ? ` · ${u.cabang}`  : ''}
              </p>
              {u.last_login && (
                <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-0.5">Login terakhir: {fmtDate(u.last_login)}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button
                onClick={() => handleToggle(u.id, u.name, u.is_active)}
                title={u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                {u.is_active
                  ? <><ToggleRight size={16} className="text-emerald-500" /> Aktif</>
                  : <><ToggleLeft  size={16} className="text-slate-400 dark:text-slate-500"  /> Nonaktif</>}
              </button>
              <button
                onClick={() => handleReset(u.id, u.name, u.nik)}
                title="Reset password ke NIK"
                className="flex items-center gap-1 text-[10px] font-semibold text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 transition-colors">
                <RefreshCw size={11} /> Reset PW
              </button>
            </div>
          </div>
        ))}
      </Card>

      {/* Info box */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-2xl p-4">
        <p className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-2">📋 Panduan Role Pengguna</p>
        <div className="space-y-1.5 text-xs text-blue-600 dark:text-blue-400">
          <p><strong>Operasional</strong> — Membuat dan memantau pengajuan milik sendiri</p>
          <p><strong>Verifikator</strong> — Memverifikasi kelengkapan dokumen pengajuan</p>
          <p><strong>Approval</strong> — Menyetujui atau menolak pengajuan yang sudah terverifikasi</p>
          <p><strong>Admin</strong> — Akses penuh: semua pengajuan + manajemen pengguna</p>
        </div>
      </div>
    </div>
  );
}
