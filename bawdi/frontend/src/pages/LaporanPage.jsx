// src/pages/LaporanPage.jsx — Laporan Akunting (Admin & Verifikator)
import { useState } from 'react';
import { Calculator, FileSpreadsheet, Receipt, Loader, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { laporanAPI } from '../utils/api';
import { Card } from '../components/ui';

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const now = new Date();
const YEARS = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

export default function LaporanPage() {
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [year, setYear]   = useState(now.getFullYear());
  const [busy, setBusy]   = useState('');                 // '' | 'transaksi' | 'pph23'

  const label = `${BULAN[month - 1]} ${year}`;

  const unduh = async (kind) => {
    setBusy(kind);
    try {
      const fname = kind === 'daftar-transaksi'
        ? `BAWDI - Daftar Transaksi ${label}.xlsx`
        : `BAWDI - Rekap PPh23 ${label}.xlsx`;
      await laporanAPI.download(kind, year, month, fname);
      toast.success('Excel berhasil diunduh');
    } catch (err) {
      toast.error(err?.message || 'Gagal mengunduh laporan');
    }
    setBusy('');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Calculator size={20} className="text-slate-500 dark:text-slate-400"/> Laporan Akunting
        </h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Ekspor data pajak &amp; transaksi per periode untuk kebutuhan pembukuan.</p>
      </div>

      {/* Pemilih periode */}
      <Card className="!p-4">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Periode</p>
        <div className="flex gap-3">
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 text-sm outline-none focus:border-amber-400">
            {BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="w-32 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 text-sm outline-none focus:border-amber-400">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
          Data disaring berdasarkan <b>tanggal pembayaran</b> — hanya pengajuan yang sudah dibayar dalam periode terpilih.
        </p>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Daftar Transaksi */}
        <Card className="!p-5">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center mb-3">
            <FileSpreadsheet size={20} className="text-emerald-600 dark:text-emerald-400"/>
          </div>
          <p className="text-base font-black text-slate-800 dark:text-slate-100 mb-1">Daftar Transaksi</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
            Satu baris per pengajuan: Tanggal, No, Cabang, Vendor, NPWP, Jenis, Keterangan, DPP, PPN, PPh23,
            Total, Dibayar, Tgl Bayar, Status &amp; Rekening — plus baris total berformula. Siap dipetakan ke akun.
          </p>
          <button onClick={() => unduh('daftar-transaksi')} disabled={!!busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold transition-colors">
            {busy === 'daftar-transaksi' ? <Loader size={14} className="animate-spin"/> : <Download size={14}/>}
            Unduh Excel — {label}
          </button>
        </Card>

        {/* Rekap PPh23 */}
        <Card className="!p-5">
          <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center mb-3">
            <Receipt size={20} className="text-amber-600 dark:text-amber-400"/>
          </div>
          <p className="text-base font-black text-slate-800 dark:text-slate-100 mb-1">Rekap PPh23</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
            Daftar pemotongan PPh23: DPP, total, &amp; nilai PPh23 diurai dari teks pengajuan, dengan kolom
            teks asli untuk verifikasi. Nilai mengikuti revisi terakhir bila ada.
          </p>
          <button onClick={() => unduh('pph23')} disabled={!!busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold transition-colors">
            {busy === 'pph23' ? <Loader size={14} className="animate-spin"/> : <Download size={14}/>}
            Unduh Excel — {label}
          </button>
        </Card>
      </div>

      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-2xl p-4">
        <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
          Catatan: DPP dihitung dari <b>Total − PPN</b>. Nilai PPh23 diurai otomatis dari teks yang diisi pemohon —
          periksa kolom "Teks Asli / Keterangan" bila ada format yang tidak terbaca. Untuk pengajuan yang direvisi,
          nilai PPN/PPh23/Total mengikuti <b>revisi terakhir yang disetujui</b>.
        </p>
      </div>
    </div>
  );
}
