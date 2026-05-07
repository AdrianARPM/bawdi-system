// src/components/VehicleHistoryPanel.jsx
// Komponen: Riwayat pengajuan sebelumnya dari kendaraan + keyword yang sama
import { useState, useEffect, useRef } from 'react';
import { History, ChevronDown, ChevronUp, ExternalLink, Clock, Wrench, AlertCircle } from 'lucide-react';
import { historyAPI } from '../utils/api';

const fmtCurrency = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function HariLalu({ hari }) {
  if (hari < 30)  return <span className="text-red-500 font-bold">{hari} hari lalu</span>;
  if (hari < 365) return <span className="text-amber-500 font-bold">{Math.floor(hari/30)} bulan lalu</span>;
  return <span className="text-slate-400 font-bold">{(hari/365).toFixed(1)} tahun lalu</span>;
}

export default function VehicleHistoryPanel({ kendaraan, keyword, onClose }) {
  const [data,     setData]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [expanded, setExpanded] = useState({}); // id → boolean
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!kendaraan?.trim()) { setData([]); return; }

    // Debounce 800ms agar tidak request tiap ketikan
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchHistory();
    }, 800);

    return () => clearTimeout(debounceRef.current);
  }, [kendaraan, keyword]);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await historyAPI.getVehicleHistory(
        kendaraan.trim(),
        keyword?.trim() || '',
        5
      );
      setData(res.data || []);
    } catch (err) {
      setError('Gagal memuat riwayat');
    }
    setLoading(false);
  };

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // Jangan render jika kendaraan belum diisi
  if (!kendaraan?.trim()) return null;

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-amber-100 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <History size={15} className="text-amber-600" />
          <p className="text-sm font-bold text-amber-800">
            Riwayat Pengajuan Sebelumnya
          </p>
          <span className="text-[10px] bg-amber-200 text-amber-700 px-2 py-0.5 rounded-full font-bold">
            {kendaraan.toUpperCase()}
          </span>
          {keyword?.trim() && (
            <span className="text-[10px] bg-white text-amber-600 border border-amber-300 px-2 py-0.5 rounded-full font-bold">
              🔍 {keyword}
            </span>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="text-amber-400 hover:text-amber-600 text-lg font-bold leading-none">×</button>
        )}
      </div>

      <div className="px-4 py-3">
        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2 py-2">
            <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-amber-600">Mencari riwayat...</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex items-center gap-2 py-2">
            <AlertCircle size={14} className="text-red-400" />
            <p className="text-xs text-red-500">{error}</p>
          </div>
        )}

        {/* Kosong */}
        {!loading && !error && data.length === 0 && (
          <div className="py-3 text-center">
            <Wrench size={20} className="text-amber-300 mx-auto mb-1.5" />
            <p className="text-xs text-amber-500 font-medium">
              {keyword?.trim()
                ? `Belum ada riwayat "${keyword}" untuk kendaraan ${kendaraan}`
                : `Belum ada riwayat pengajuan untuk kendaraan ${kendaraan}`
              }
            </p>
          </div>
        )}

        {/* Data */}
        {!loading && !error && data.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-[10px] text-amber-600 font-semibold">
              {data.length} riwayat ditemukan — diurutkan dari terbaru:
            </p>

            {data.map((item) => (
              <div key={item.id}
                className="bg-white rounded-xl border border-amber-200 overflow-hidden shadow-sm">

                {/* Summary row */}
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  className="w-full flex items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-amber-50 transition-colors">

                  <div className="flex-1 min-w-0">
                    {/* Nomor & tanggal */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{item.type}</span>
                      <span className="text-xs font-bold text-slate-700 truncate">{item.nomor_pengajuan}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        item.status === 'Selesai' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'
                      }`}>{item.status}</span>
                    </div>

                    {/* Vendor & tanggal */}
                    <p className="text-[11px] text-slate-500 truncate mb-0.5">
                      📍 {item.vendor_dipakai || item.jenis_pembelian}
                    </p>

                    {/* Tanggal & hari lalu */}
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <Clock size={9} /> {fmtDate(item.tanggal_bayar || item.tanggal)}
                      </span>
                      <HariLalu hari={item.hari_lalu} />
                    </div>
                  </div>

                  {/* Total & expand */}
                  <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                    <p className="text-sm font-black text-emerald-600">
                      {fmtCurrency(item.jumlah_bayar || item.total_harga)}
                    </p>
                    {item.jumlah_bayar !== item.total_harga && item.jumlah_bayar > 0 && (
                      <p className="text-[9px] text-slate-400 line-through">
                        {fmtCurrency(item.total_harga)}
                      </p>
                    )}
                    {expanded[item.id]
                      ? <ChevronUp size={14} className="text-amber-400" />
                      : <ChevronDown size={14} className="text-amber-400" />
                    }
                  </div>
                </button>

                {/* Detail items — hanya tampil jika di-expand */}
                {expanded[item.id] && (
                  <div className="border-t border-amber-100 bg-amber-50/50 px-3 py-2.5 space-y-1.5">
                    {/* Item yang relevan */}
                    {item.items_relevan?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-amber-700 mb-1 uppercase tracking-wide">
                          Item{keyword?.trim() ? ` yang cocok dengan "${keyword}"` : ''}:
                        </p>
                        {item.items_relevan.map((it, i) => (
                          <div key={i}
                            className="flex justify-between items-start gap-2 py-1 border-b border-amber-100 last:border-0">
                            <p className="text-[11px] text-slate-600 flex-1 leading-relaxed">
                              {it.penjelasan}
                            </p>
                            <div className="text-right flex-shrink-0">
                              <p className="text-[10px] font-bold text-slate-600">{fmtCurrency(it.total || it.harga)}</p>
                              <p className="text-[9px] text-slate-400">{it.satuan}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Info tambahan */}
                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[10px] text-slate-400">
                        Oleh: {item.pemohon}
                      </p>
                      <a
                        href={`/submissions/${item.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[10px] text-amber-600 font-semibold hover:text-amber-800"
                        onClick={e => e.stopPropagation()}>
                        Lihat detail <ExternalLink size={9} />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <p className="text-[10px] text-amber-500 text-center mt-1">
              💡 Klik setiap riwayat untuk melihat detail item dan biaya
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
