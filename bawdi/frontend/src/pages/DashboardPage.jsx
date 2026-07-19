// src/pages/DashboardPage.jsx — v2 (Dark Mode Tahap 2: hanya penambahan varian dark:, tanpa perubahan fitur)
import { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { LayoutDashboard, FileText, Clock, CheckCircle, XCircle, AlertTriangle, Plus, Files, CreditCard, Ban, Wallet } from 'lucide-react';
import { submissionAPI } from '../utils/api';
import { StatCard, Pill, fmtDate, fmtCurrency, daysSince, Spinner, Card } from '../components/ui';
import useAuthStore from '../context/authStore';
import OverdueModal from '../components/OverdueModal';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [sRes, lRes] = await Promise.all([
          submissionAPI.stats(),
          submissionAPI.list({ limit: 5 }),
        ]);
        setStats(sRes.data);
        setRecent(lRes.data.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
    // Refresh tiap 60 detik
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

if (loading) return <Spinner size={32} />;

  if (user?.role === 'Pengawas') return <Navigate to="/submissions" replace/>;

  // Card Request Pembayaran → kolom kanan (khusus Admin/Verifikator/Approval, hanya bila ada isinya)
  const hasPayReq   = ['Admin','Verifikator','Approval'].includes(user?.role) && stats?.payment_requests?.length > 0;
  const hasVerifReq = user?.role === 'Verifikator' && stats?.verification_requests?.length > 0;
  const showReqCol  = hasPayReq || hasVerifReq;
  const verifCard = (
    <Card padding={false}>
      <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-800">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">⏰ Request Verifikasi</p>
      </div>
      {(stats?.verification_requests || []).map((r, i) => (
        <Link key={r.id} to={`/submissions/${r.id}`}
          className={`flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${i < stats.verification_requests.length-1 ? 'border-b border-slate-50 dark:border-slate-800' : ''}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"/>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{r.nomor_pengajuan}</span>
          <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">{fmtDate(r.verif_diminta_at)}</span>
        </Link>
      ))}
    </Card>
  );
  const reqCard = (
    <Card padding={false}>
      <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-800">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">💳 Request Pembayaran</p>
      </div>
      {(stats?.payment_requests || []).map((r, i) => (
        <Link key={r.id} to={`/submissions/${r.id}`}
          className={`flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${i < stats.payment_requests.length-1 ? 'border-b border-slate-50 dark:border-slate-800' : ''}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"/>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{r.nomor_pengajuan}</span>
          <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">{fmtDate(r.bayar_diminta_at)}</span>
        </Link>
      ))}
    </Card>
  );

  return (
    <div className={showReqCol ? "flex flex-col lg:flex-row gap-5 max-w-5xl mx-auto items-start" : "space-y-5 max-w-2xl mx-auto"}>
      {/* Modal pengingat pengajuan overdue > 3 hari */}
      <OverdueModal />
      {showReqCol && (
        <div className="w-full lg:w-72 lg:order-2 flex-shrink-0 space-y-5">
          {hasVerifReq && verifCard}
          {hasPayReq && reqCard}
        </div>
      )}
      <div className={showReqCol ? "flex-1 min-w-0 lg:order-1 space-y-5 w-full" : "contents"}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Selamat datang, {user?.name}</p>
        </div>
        {['Operasional','Admin'].includes(user?.role) && (
          <Link to="/new"
            className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-3 py-2 rounded-xl transition-all">
            <Plus size={14} /> Buat Pengajuan
          </Link>
        )}
      </div>

      {/* Alert: pengajuan > 3 hari */}
      {stats?.alerts?.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-2xl p-4">
          <div className="flex gap-3">
            <AlertTriangle size={17} className="text-orange-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-orange-800 dark:text-orange-300 mb-1">
                {stats.alerts.length} Pengajuan Tidak Ditanggapi (&gt; 3 Hari)
              </p>
              <p className="text-xs text-orange-600 dark:text-orange-400 mb-2">Segera hubungi Verifikator atau Approval terkait:</p>
              {stats.alerts.map(a => (
                <button key={a.id} onClick={() => navigate(`/submissions/${a.id}`)}
                  className="block text-xs font-semibold text-orange-600 dark:text-orange-400 underline mb-1 text-left">
                  {a.nomor_pengajuan} — sudah {daysSince(a.tanggal)} hari
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2 mb-4">
        <StatCard label="Semua Pengajuan"    value={stats?.total ?? 0}               icon={Files}        iconBg="bg-blue-50 dark:bg-blue-500/10"     iconColor="text-blue-600 dark:text-blue-400" />
        <StatCard label="Menunggu Verifikasi" value={stats?.menunggu_verifikasi ?? 0} icon={Clock}       iconBg="bg-amber-50 dark:bg-amber-500/10"   iconColor="text-amber-600 dark:text-amber-400" />
        <StatCard label="Belum Dibayar"      value={stats?.belum_dibayar ?? 0}       icon={CreditCard}   iconBg="bg-orange-50 dark:bg-orange-500/10" iconColor="text-orange-600 dark:text-orange-400" />
        <StatCard label="Dibatalkan"         value={stats?.dibatalkan ?? 0}          icon={Ban}          iconBg="bg-red-50 dark:bg-red-500/10"       iconColor="text-red-600 dark:text-red-400" />
        <StatCard label="Disetujui"          value={stats?.disetujui ?? 0}           icon={CheckCircle}  iconBg="bg-emerald-50 dark:bg-emerald-500/10" iconColor="text-emerald-600 dark:text-emerald-400" />
        <StatCard label="Sudah Dibayar (Belum Ditutup)" value={stats?.sudah_dibayar_belum_tutup ?? 0} icon={Wallet} iconBg="bg-emerald-50 dark:bg-emerald-500/10" iconColor="text-emerald-600 dark:text-emerald-400" />
      </div>

      {/* Recent submissions */}
      <Card padding={false}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50 dark:border-slate-800">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Pengajuan Terbaru</p>
          <Link to="/submissions" className="text-xs font-semibold text-brand-500 hover:text-brand-600">Lihat Semua →</Link>
        </div>
        {recent.length === 0 && (
          <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-sm">Belum ada pengajuan</div>
        )}
        {recent.map((s, i) => {
          const isAlert = ['Menunggu Verifikasi','Terverifikasi'].includes(s.status) && daysSince(s.tanggal) > 3;
          return (
            <Link key={s.id} to={`/submissions/${s.id}`}
              className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${i < recent.length-1 ? 'border-b border-slate-50 dark:border-slate-800' : ''}`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                s.status === 'Disetujui' ? 'bg-emerald-500' :
                s.status === 'Ditolak'   ? 'bg-red-500' :
                s.status === 'Terverifikasi' ? 'bg-blue-500' : 'bg-amber-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {isAlert && <span className="text-orange-500">⚠ </span>}
                  {s.nomor_pengajuan}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{s.kendaraan} · {s.vendor}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <Pill status={s.status} />
                <p className="text-xs font-semibold text-brand-500 mt-1">{fmtCurrency(s.total_harga)}</p>
              </div>
            </Link>
          );
        })}
      </Card>
      </div>
    </div>
  );
}
