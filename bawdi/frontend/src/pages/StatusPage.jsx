// src/pages/StatusPage.jsx — panel Status Sistem (khusus Admin)
// Pelengkap UptimeRobot: UptimeRobot = alarm dari luar, halaman ini = stetoskop Admin.
import { useState, useEffect } from 'react';
import { RefreshCw, Server, Database, Clock, BellRing, Mail, ListTodo, Download } from 'lucide-react';
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
    ok:    'text-emerald-600',
    warn:  'text-amber-600',
    bad:   'text-red-600',
    plain: 'text-slate-800',
  }[tone];
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={12} className="text-slate-400"/>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-lg font-black leading-none ${toneCls}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-1.5">{sub}</p>}
    </div>
  );
}

export default function StatusPage() {
  const [data, setData]       = useState(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [exporting, setExporting] = useState('');

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
          <h1 className="text-xl font-black text-slate-800">Status Sistem</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Diperbarui {updatedAt ? updatedAt.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }) : '—'} WIB · otomatis tiap 30 detik
          </p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-xl px-3 py-2 hover:bg-slate-50 transition-colors">
          <RefreshCw size={12}/> Segarkan
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded-2xl p-4">
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
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Mail size={12} className="text-slate-400"/>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Email 24 jam terakhir</p>
                <span className="ml-auto text-xs font-black text-slate-700">{data.email_24h?.total ?? 0}</span>
              </div>
              {emailTypes.length === 0 ? (
                <p className="text-xs text-slate-400">Belum ada email terkirim 24 jam terakhir.</p>
              ) : (
                <div className="space-y-1">
                  {emailTypes.map(([type, n]) => (
                    <div key={type} className="flex justify-between text-xs py-1 border-b border-slate-50 last:border-0">
                      <span className="text-slate-600">{type}</span>
                      <span className="font-bold text-slate-800">{n}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Antrian macet */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <ListTodo size={12} className="text-slate-400"/>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Antrian perlu perhatian</p>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs py-1 border-b border-slate-50">
                  <span className="text-slate-600">Menunggu verifikasi ≥3 hari</span>
                  <span className={`font-bold ${q.menunggu_verifikasi > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{q.menunggu_verifikasi ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs py-1 border-b border-slate-50">
                  <span className="text-slate-600">Menunggu persetujuan ≥3 hari</span>
                  <span className={`font-bold ${q.menunggu_persetujuan > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{q.menunggu_persetujuan ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-slate-600">Disetujui belum ada nota</span>
                  <span className={`font-bold ${q.belum_nota > 0 ? 'text-red-600' : 'text-slate-800'}`}>{q.belum_nota ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Backup & Export */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Download size={12} className="text-slate-400"/>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Backup & Export Data</p>
            </div>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              Unduh seluruh data (pengajuan, item, revisi, user tanpa password, kendaraan, kas kecil) untuk disimpan
              berkala. Excel untuk dibaca, JSON untuk arsip pemulihan. Backup penuh otomatis berjalan tiap 03:00 WIB
              via GitHub Actions.
            </p>
            <div className="flex gap-2.5">
              <button onClick={() => doExport('xlsx')} disabled={!!exporting}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl py-2.5 hover:bg-emerald-100 transition-colors disabled:opacity-50">
                <Download size={12}/> {exporting === 'xlsx' ? 'Menyiapkan…' : 'Export Excel'}
              </button>
              <button onClick={() => doExport('json')} disabled={!!exporting}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl py-2.5 hover:bg-blue-100 transition-colors disabled:opacity-50">
                <Download size={12}/> {exporting === 'json' ? 'Menyiapkan…' : 'Export JSON'}
              </button>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed">
            Panel ini untuk diagnosis saat sistem hidup. Alarm saat server mati dikirim oleh UptimeRobot (cek /api/health dari luar tiap 5 menit).
            Riwayat CPU/RAM ada di dashboard Railway → Metrics; log error detail di Railway → Deploy Logs.
          </p>
        </>
      )}
    </div>
  );
}
