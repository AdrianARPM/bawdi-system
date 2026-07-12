// src/pages/StatusPage.jsx — panel Status Sistem (khusus Admin) — Dark Mode Tahap 5 (hanya varian dark:)
// Pelengkap UptimeRobot: UptimeRobot = alarm dari luar, halaman ini = stetoskop Admin.
import { useState, useEffect } from 'react';
import { RefreshCw, Server, Database, Clock, BellRing, Mail, ListTodo, Download, ScrollText } from 'lucide-react';
import { healthAPI, backupAPI } from '../utils/api';
import { Spinner } from '../components/ui';

const fmtUptime = (s) => {
  if (s == null) return '—';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} hari ${h} jam`;
  if (h > 0) return `${h} jam ${m} mnt`;
  return `${m} menit`;
};

const fmtWIB = (iso) => iso
  ? new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—';

const minutesSince = (iso) => iso ? Math.floor((Date.now() - new Date(iso)) / 60000) : null;

function StatCard({ icon: Icon, label, value, sub, tone = 'ok' }) {
  const toneCls = {
    ok:    'text-emerald-600 dark:text-emerald-400',
    warn:  'text-amber-600 dark:text-amber-400',
    bad:   'text-red-600 dark:text-red-400',
    plain: 'text-slate-800 dark:text-slate-100',
  }[tone];
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={12} className="text-slate-400 dark:text-slate-500"/>
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-lg font-black leading-none ${toneCls}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">{sub}</p>}
    </div>
  );
}

export default function StatusPage() {
  const [data, setData]       = useState(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [exporting, setExporting] = useState('');
  const [audit, setAudit] = useState([]);

  const doExport = async (format) => {
    if (exporting) return;
    setExporting(format);
    try {
      const { data } = await backupAPI.export(format);
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bawdi_export_${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Gagal membuat export — coba lagi.');
    } finally { setExporting(''); }
  };

  const load = async () => {
    try {
      const { data: d } = await healthAPI.detail();
      setData(d); setError(''); setUpdatedAt(new Date());
      healthAPI.audit().then(r => setAudit(r.data?.data || [])).catch(() => {});
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal menghubungi server — server mungkin sedang down.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // segarkan tiap 30 detik
    return () => clearInterval(t);
  }, []);

  if (loading) return <Spinner size={32}/>;

  const schedMin  = minutesSince(data?.scheduler?.last_run);
  const schedTone = data?.scheduler?.last_run == null ? 'warn' : schedMin > 60 ? 'bad' : 'ok';
  const dbOk      = data?.db === 'ok';
  const latTone   = !dbOk ? 'bad' : data.db_latency_ms > 1500 ? 'warn' : 'ok';
  const emailTypes = Object.entries(data?.email_24h?.by_type || {}).sort((a, b) => b[1] - a[1]);
  const q = data?.queue || {};

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">Status Sistem</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Diperbarui {updatedAt ? updatedAt.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }) : '—'} WIB · otomatis tiap 30 detik
          </p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
          <RefreshCw size={12}/> Segarkan
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-sm font-semibold rounded-2xl p-4">
          ⚠ {error}
        </div>
      )}

      {data && (
        <>
          {/* Kartu inti */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Server} label="Server"
              value={dbOk ? '● Sehat' : '● Gangguan'} tone={dbOk ? 'ok' : 'bad'}
              sub={`uptime ${fmtUptime(data.uptime_s)}`}/>
            <StatCard icon={Database} label="Database"
              value={dbOk ? `${data.db_latency_ms} ms` : 'Error'} tone={latTone}
              sub={dbOk ? 'latensi Railway → Supabase' : data.db}/>
            <StatCard icon={Clock} label="Scheduler"
              value={data.scheduler?.last_run == null ? 'Belum jalan' : schedMin <= 60 ? '● Jalan' : '● Macet'}
              tone={schedTone}
              sub={data.scheduler?.last_run == null
                ? 'menunggu run pertama sejak restart'
                : `run terakhir ${fmtWIB(data.scheduler.last_run)} (${schedMin} mnt lalu)`}/>
            <StatCard icon={BellRing} label="Push"
              value={`${data.push?.devices ?? 0} perangkat`} tone="plain"
              sub={data.push?.vapid ? 'VAPID terkonfigurasi ✓' : '⚠ VAPID belum diset'}/>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {/* Email 24 jam */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Mail size={12} className="text-slate-400 dark:text-slate-500"/>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Email 24 jam terakhir</p>
                <span className="ml-auto text-xs font-black text-slate-700 dark:text-slate-200">{data.email_24h?.total ?? 0}</span>
              </div>
              {emailTypes.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">Belum ada email terkirim 24 jam terakhir.</p>
              ) : (
                <div className="space-y-1">
                  {emailTypes.map(([type, n]) => (
                    <div key={type} className="flex justify-between text-xs py-1 border-b border-slate-50 dark:border-slate-800 last:border-0">
                      <span className="text-slate-600 dark:text-slate-300">{type}</span>
                      <span className="font-bold text-slate-800 dark:text-slate-100">{n}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Antrian macet */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <ListTodo size={12} className="text-slate-400 dark:text-slate-500"/>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Antrian perlu perhatian</p>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs py-1 border-b border-slate-50 dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-300">Menunggu verifikasi ≥3 hari</span>
                  <span className={`font-bold ${q.menunggu_verifikasi > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'}`}>{q.menunggu_verifikasi ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs py-1 border-b border-slate-50 dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-300">Menunggu persetujuan ≥3 hari</span>
                  <span className={`font-bold ${q.menunggu_persetujuan > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-100'}`}>{q.menunggu_persetujuan ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-600 dark:text-slate-300">Disetujui belum ada nota</span>
                  <span className={`font-bold ${q.belum_nota > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>{q.belum_nota ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Log Audit */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <ScrollText size={12} className="text-slate-400 dark:text-slate-500"/>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Log Audit — 50 terakhir</p>
            </div>
            {audit.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">Belum ada catatan. Aksi penting (verifikasi, persetujuan, pembayaran, pembatalan, kelola user) akan tercatat di sini.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-slate-400 dark:text-slate-500">
                      <th className="py-1 pr-3 font-semibold">Waktu (WIB)</th>
                      <th className="py-1 pr-3 font-semibold">User</th>
                      <th className="py-1 pr-3 font-semibold">Aksi</th>
                      <th className="py-1 pr-3 font-semibold">Target</th>
                      <th className="py-1 font-semibold">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map(a => {
                      const badge = {
                        batalkan: 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-300', hapus_permanen: 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-300',
                        bayar: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', dp: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                        verifikasi: 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300', setujui: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                        tolak: 'bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300', tutup_arsip: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
                        hapus_nota: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
                      }[a.action] || (a.action?.startsWith('revisi') ? 'bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300'
                        : a.action?.startsWith('user') ? 'bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300');
                      return (
                        <tr key={a.id} className="border-t border-slate-50 dark:border-slate-800 align-top">
                          <td className="py-1.5 pr-3 text-slate-400 dark:text-slate-500 whitespace-nowrap">{fmtWIB(a.created_at)}</td>
                          <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200 font-semibold whitespace-nowrap">{a.user_name || '—'}</td>
                          <td className="py-1.5 pr-3"><span className={`px-1.5 py-0.5 rounded font-bold ${badge}`}>{a.action}</span></td>
                          <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{a.target || '—'}</td>
                          <td className="py-1.5 text-slate-400 dark:text-slate-500">{a.detail || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Backup & Export */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Download size={12} className="text-slate-400 dark:text-slate-500"/>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Backup & Export Data</p>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
              Unduh seluruh data (pengajuan, item, revisi, user tanpa password, kendaraan, kas kecil) untuk disimpan
              berkala. Excel untuk dibaca, JSON untuk arsip pemulihan. Backup penuh otomatis berjalan tiap 03:00 WIB
              via GitHub Actions.
            </p>
            <div className="flex gap-2.5">
              <button onClick={() => doExport('xlsx')} disabled={!!exporting}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl py-2.5 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                <Download size={12}/> {exporting === 'xlsx' ? 'Menyiapkan…' : 'Export Excel'}
              </button>
              <button onClick={() => doExport('json')} disabled={!!exporting}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl py-2.5 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors disabled:opacity-50">
                <Download size={12}/> {exporting === 'json' ? 'Menyiapkan…' : 'Export JSON'}
              </button>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
            Panel ini untuk diagnosis saat sistem hidup. Alarm saat server mati dikirim oleh UptimeRobot (cek /api/health dari luar tiap 5 menit).
            Riwayat CPU/RAM ada di dashboard Railway → Metrics; log error detail di Railway → Deploy Logs.
          </p>
        </>
      )}
    </div>
  );
}
