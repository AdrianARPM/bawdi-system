// src/pages/AnalyticsPage.jsx
import { useState, useEffect } from 'react';
import { TrendingUp, FileText, Wallet, CalendarDays, Download, Loader, Car, Tag, Store, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { analyticsAPI } from '../utils/api';
import { Card } from '../components/ui';

const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const fmtRpShort = (n) => {
  n = Number(n) || 0;
  if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(1) + 'M';
  if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(1) + 'jt';
  if (n >= 1e3) return 'Rp ' + (n / 1e3).toFixed(0) + 'rb';
  return 'Rp ' + n;
};

const PERIODS = [
  { label: '3 Bulan',  value: 3 },
  { label: '6 Bulan',  value: 6 },
  { label: '12 Bulan', value: 12 },
];

// Warna untuk bar
const BAR_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#ec4899', '#14b8a6', '#f97316'];

/* ── Bar chart vertikal (per bulan) ── */
function MonthlyBarChart({ data }) {
  const max = Math.max(...data.map(d => d.total), 1);
  return (
    <div className="flex items-end justify-between gap-1.5 h-44 pt-4">
      {data.map((d, i) => {
        const h = max ? (d.total / max) * 100 : 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            {/* Tooltip */}
            <div className="absolute -top-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
              {fmtRp(d.total)} • {d.count}x
            </div>
            <div className="w-full flex items-end justify-center" style={{ height: '140px' }}>
              <div className="w-full max-w-[36px] rounded-t-md transition-all hover:opacity-80"
                style={{ height: `${h}%`, minHeight: d.total > 0 ? '4px' : '0', background: 'linear-gradient(to top, #f59e0b, #fbbf24)' }}/>
            </div>
            <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Bar chart horizontal (ranking) ── */
function HBarChart({ data, labelKey, valueKey, countKey, colorOffset = 0, showRp = true }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  if (!data.length) return <p className="text-xs text-slate-400 italic py-4 text-center">Belum ada data</p>;
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => {
        const w = max ? (d[valueKey] / max) * 100 : 0;
        const color = BAR_COLORS[(i + colorOffset) % BAR_COLORS.length];
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="text-xs font-semibold text-slate-700 truncate flex-1" title={d[labelKey]}>{d[labelKey]}</span>
              <span className="text-xs font-bold text-slate-600 flex-shrink-0">
                {showRp ? fmtRpShort(d[valueKey]) : d[valueKey]}
                {countKey && <span className="text-[10px] text-slate-400 ml-1">({d[countKey]}x)</span>}
              </span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(w, 2)}%`, background: color }}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Summary card ── */
function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <Card className="!p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] text-slate-400 font-medium mb-1">{label}</p>
          <p className="text-lg font-black text-slate-800 truncate">{value}</p>
          {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
          <Icon size={17} className="text-white"/>
        </div>
      </div>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [months, setMonths]   = useState(6);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    analyticsAPI.get(months)
      .then(({ data: res }) => { if (alive) setData(res); })
      .catch(err => { if (alive) toast.error(err.response?.data?.error || 'Gagal memuat analitik'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [months]);

  const exportCSV = () => {
    if (!data) return;
    const rows = [];
    rows.push(['LAPORAN ANALITIK MAINTENANCE BAWDI']);
    rows.push([`Periode: ${months} bulan terakhir`]);
    rows.push([`Digenerate: ${new Date().toLocaleString('id-ID')}`]);
    rows.push([]);
    rows.push(['RINGKASAN']);
    rows.push(['Total Pengeluaran', data.summary.totalPengeluaran]);
    rows.push(['Total Pengajuan', data.summary.totalPengajuan]);
    rows.push(['Rata-rata per Pengajuan', data.summary.rataRata]);
    rows.push([]);
    rows.push(['PENGELUARAN PER BULAN']);
    rows.push(['Bulan', 'Total (Rp)', 'Jumlah']);
    data.perBulan.forEach(d => rows.push([d.label, d.total, d.count]));
    rows.push([]);
    rows.push(['PER KENDARAAN']);
    rows.push(['Kendaraan', 'Total (Rp)', 'Jumlah']);
    data.perKendaraan.forEach(d => rows.push([d.kendaraan, d.total, d.count]));
    rows.push([]);
    rows.push(['PER JENIS PEMBELIAN']);
    rows.push(['Jenis', 'Total (Rp)', 'Jumlah']);
    data.perJenis.forEach(d => rows.push([d.jenis, d.total, d.count]));
    rows.push([]);
    rows.push(['PER VENDOR']);
    rows.push(['Vendor', 'Total (Rp)', 'Jumlah']);
    data.perVendor.forEach(d => rows.push([d.vendor, d.total, d.count]));
    rows.push([]);
    rows.push(['PER CABANG']);
    rows.push(['Cabang', 'Total (Rp)', 'Jumlah']);
    data.perCabang.forEach(d => rows.push([d.cabang, d.total, d.count]));

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Analitik-BAWDI-${months}bulan-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Laporan CSV berhasil diunduh');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader size={28} className="text-amber-400 animate-spin"/>
      </div>
    );
  }

  if (!data) {
    return <Card><p className="text-sm text-slate-400 text-center py-8">Data tidak tersedia</p></Card>;
  }

  const { summary } = data;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-800">Dashboard Analitik</h1>
          <p className="text-xs text-slate-400">Laporan pengeluaran maintenance — {months} bulan terakhir</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex bg-slate-100 rounded-xl p-1">
            {PERIODS.map(p => (
              <button key={p.value} onClick={() => setMonths(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${months===p.value?'bg-white text-amber-600 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors">
            <Download size={14}/> Export CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Wallet}       label="Total Pengeluaran"    value={fmtRpShort(summary.totalPengeluaran)} sub={fmtRp(summary.totalPengeluaran)} color="bg-amber-500"/>
        <StatCard icon={FileText}     label="Total Pengajuan"      value={summary.totalPengajuan}               sub="disetujui & selesai" color="bg-blue-500"/>
        <StatCard icon={TrendingUp}   label="Rata-rata/Pengajuan"  value={fmtRpShort(summary.rataRata)}         sub={fmtRp(summary.rataRata)} color="bg-emerald-500"/>
        <StatCard icon={CalendarDays} label="Bulan Ini"            value={summary.pengajuanBulanIni}            sub="pengajuan" color="bg-purple-500"/>
      </div>

      {/* Pengeluaran per bulan */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={16} className="text-amber-500"/>
          <h2 className="text-sm font-bold text-slate-700">Pengeluaran per Bulan</h2>
        </div>
        <p className="text-[11px] text-slate-400 mb-2">Tren biaya maintenance dari waktu ke waktu</p>
        <MonthlyBarChart data={data.perBulan}/>
      </Card>

      {/* 2 kolom: kendaraan & jenis */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Car size={16} className="text-blue-500"/>
            <h2 className="text-sm font-bold text-slate-700">Kendaraan Paling Boros</h2>
          </div>
          <HBarChart data={data.perKendaraan} labelKey="kendaraan" valueKey="total" countKey="count"/>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Tag size={16} className="text-emerald-500"/>
            <h2 className="text-sm font-bold text-slate-700">Pengeluaran per Jenis</h2>
          </div>
          <HBarChart data={data.perJenis} labelKey="jenis" valueKey="total" countKey="count" colorOffset={2}/>
        </Card>
      </div>

      {/* 2 kolom: vendor & cabang */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Store size={16} className="text-purple-500"/>
            <h2 className="text-sm font-bold text-slate-700">Vendor Paling Sering</h2>
          </div>
          <HBarChart data={data.perVendor} labelKey="vendor" valueKey="count" countKey={null} colorOffset={3} showRp={false}/>
          {data.perVendor.length > 0 && (
            <p className="text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-50">
              Total transaksi vendor teratas: {data.perVendor[0]?.vendor} ({data.perVendor[0]?.count}x, {fmtRpShort(data.perVendor[0]?.total)})
            </p>
          )}
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={16} className="text-orange-500"/>
            <h2 className="text-sm font-bold text-slate-700">Pengeluaran per Cabang</h2>
          </div>
          <HBarChart data={data.perCabang} labelKey="cabang" valueKey="total" countKey="count" colorOffset={5}/>
        </Card>
      </div>

      <p className="text-[10px] text-slate-400 text-center pb-4">
        Data dihitung dari pengajuan berstatus "Disetujui" & "Selesai". Pengeluaran berdasarkan jumlah pembayaran (atau total disetujui jika belum dibayar).
      </p>
    </div>
  );
}
