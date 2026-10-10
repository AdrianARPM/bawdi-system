// src/pages/WorkflowPage.jsx — Pengaturan Alur Persetujuan PR/PAR per cabang (Admin)
// Model per-langkah: tiap cabang × tipe (PR/PAR) mengatur DUA langkah bebas —
// Verifikasi & Persetujuan — masing-masing boleh "Tidak perlu".
// Jika Persetujuan "Tidak perlu", pengajuan tetap berakhir Disetujui tetapi nama
// approver kosong (finalisasi terjadi saat verifikasi).
import { useState, useEffect } from 'react';
import { GitBranch, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { workflowAPI } from '../utils/api';
import { Card, Spinner, Empty } from '../components/ui';

const NONE = '';   // "Tidak perlu"
const selCls =
  'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 ' +
  'dark:bg-slate-900 dark:text-slate-100 text-sm outline-none focus:border-amber-400';

export default function WorkflowPage() {
  const [rows,    setRows]    = useState([]);
  const [aktor,   setAktor]   = useState([]);   // daftar aktor valid
  const [def,     setDef]     = useState({});   // {PR:{verifikasi,approval}, PAR:{...}}
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState('');   // `${cabang}|${type}` sedang disimpan

  const load = async () => {
    try {
      const { data } = await workflowAPI.list();
      setRows(data.data || []);
      setAktor(data.aktor || []);
      setDef(data.default || {});
    } catch { toast.error('Gagal memuat pengaturan alur'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Nilai efektif sebuah langkah (config cabang, atau default).
  const eff = (r, type) => r[type] || def[type] || { verifikasi: null, approval: null };

  const save = async (cabang, type, verif, appr) => {
    const key = `${cabang}|${type}`;
    setBusy(key);
    // optimistic
    setRows(rs => rs.map(r => r.cabang === cabang
      ? { ...r, [type]: (!verif && !appr) ? null : { verifikasi: verif || null, approval: appr || null } }
      : r));
    try {
      const { data } = await workflowAPI.set(cabang, type, verif || null, appr || null);
      toast.success(data.message);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan');
      await load();
    }
    setBusy('');
  };

  const changeStep = (r, type, step, value) => {
    const cur = eff(r, type);
    const verif = step === 'verifikasi' ? value : (cur.verifikasi || NONE);
    const appr  = step === 'approval'   ? value : (cur.approval   || NONE);
    save(r.cabang, type, verif, appr);
  };

  const resetDefault = (r, type) => save(r.cabang, type, NONE, NONE);

  if (loading) return <Spinner size={32} />;

  const StepSelect = ({ cabang, type, step, value, noneLabel }) => (
    <select
      className={selCls}
      value={value || NONE}
      disabled={busy === `${cabang}|${type}`}
      onChange={e => changeStep(rows.find(r => r.cabang === cabang), type, step, e.target.value)}
    >
      <option value={NONE}>{noneLabel}</option>
      {aktor.map(a => <option key={a} value={a}>{a}</option>)}
    </select>
  );

  const TypeBlock = ({ r, type }) => {
    const isDefault = !r[type];
    const e = eff(r, type);
    return (
      <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-black text-slate-700 dark:text-slate-200">
            Dokumen {type}
            {isDefault && <span className="ml-1.5 text-[10px] font-semibold text-slate-400">(default)</span>}
          </p>
          {!isDefault && (
            <button onClick={() => resetDefault(r, type)}
              className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <RotateCcw size={11} /> Default
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Verifikasi</label>
            <StepSelect cabang={r.cabang} type={type} step="verifikasi" value={e.verifikasi} noneLabel="— Tidak perlu —" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Persetujuan</label>
            <StepSelect cabang={r.cabang} type={type} step="approval" value={e.approval} noneLabel="— Tidak perlu (approver kosong) —" />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
          {e.verifikasi || '—'} <span className="opacity-60">→</span> {e.approval || 'langsung Disetujui (approver kosong)'}
        </p>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
          <GitBranch size={18} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">Alur Persetujuan</h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
            Atur langkah Verifikasi & Persetujuan PR / PAR tiap cabang/project.
          </p>
        </div>
      </div>

      {rows.length === 0 && (
        <Empty icon={GitBranch} message="Belum ada cabang terdeteksi"
          sub="Cabang muncul otomatis dari data user & pengajuan." />
      )}

      {rows.map((r) => (
        <Card key={r.cabang} className="p-4 space-y-3">
          <p className="text-sm font-black text-slate-800 dark:text-slate-100 font-mono">
            {r.cabang}
            {r.nama && <span className="ml-2 font-sans font-semibold text-slate-400 dark:text-slate-500">{r.nama}</span>}
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <TypeBlock r={r} type="PR" />
            <TypeBlock r={r} type="PAR" />
          </div>
        </Card>
      ))}

      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-2xl p-4">
        <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
          Minimal satu langkah harus terisi. Bila <strong>Persetujuan = Tidak perlu</strong>, pelaku
          verifikasi langsung memfinalkan pengajuan (status tetap <strong>Disetujui</strong>, nama
          approver dikosongkan). Pencatatan, nota, dan pembayaran tetap sama. Jenis <strong>Beban Dana
          Sosial</strong> tetap ditangani HRGA di semua cabang. Cabang bertanda <em>(default)</em>
          mengikuti aturan bawaan (PR: Verifikator → Approval · PAR: langsung Kepala Operasional).
        </p>
      </div>
    </div>
  );
}
