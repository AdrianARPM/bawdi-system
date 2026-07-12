// src/pages/NewFormPage.jsx  — v25 (Dark Mode Tahap 4: hanya penambahan varian dark:, tanpa perubahan fitur — basis isi kode v24; catatan: komentar header di file produksi masih tertulis v18)
// v18: diskon nominal per item (opsional). Total item = (qty × harga) − diskon.
// v17: penjelasan item jadi COMBOBOX autocomplete dari item yg pernah diajukan
//      untuk kendaraan terpilih (tiap saran tampil dgn nomor pengajuan). Tetap
//      bisa ketik item baru. KM auto-fill kini cocok SAMA-PERSIS (lihat backend).
// v15: mode 'Barang Kantor / Umum' (is_umum). PR tanpa kendaraan/KM/kategori,
//      tidak masuk Master Kendaraan. Alur & nomor tetap PR.
// v12: Plat kendaraan jadi DROPDOWN dari Master Kendaraan (+ opsi "Plat baru")
//      Menghilangkan typo plat; plat baru tetap bisa & auto-register ke master
// Perubahan dari v10:
// 1. Riwayat KM SEKARANG PER-ITEM (tidak lagi global per submission)
// 2. Setiap ItemRow punya section KM-nya sendiri (opsional, tetap muncul)
// 3. Auto-fetch KM berdasarkan plat + penjelasan item saat user blur penjelasan
// 4. Jika arsip kosong, KM & tanggal terakhir bisa diisi manual per item
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Check, ChevronLeft, Upload, X, AlertCircle, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import { submissionAPI, photoAPI, historyAPI, vehicleAPI, offlineQueue, revisionAPI } from '../utils/api';
import { Card, Button, Spinner, fmtCurrency } from '../components/ui';
import VehicleHistoryPanel from '../components/VehicleHistoryPanel';
import useAuthStore from '../context/authStore';

const STEPS = ['Jenis & Nomor', 'Pemohon', 'Vendor 1', 'Vendor 2', 'Foto', 'Review'];

function buildNomor(nomorUrut, type, cabangManual) {
  const now   = new Date();
  const bulan = String(now.getMonth() + 1).padStart(2, '0');
  const tahun = String(now.getFullYear()).slice(-2);
  const cab   = (cabangManual || '').replace(/\s+/g, '').toUpperCase();
  return `${nomorUrut}-${type}/BKD-${cab}/${bulan}${tahun}`;
}

function calcItemTotal(item) {
  const qty    = parseFloat(item.satuan) || 1;
  const harga  = parseFloat(item.harga)  || 0;
  const diskon = parseFloat(item.diskon) || 0;
  return Math.max(0, qty * harga - diskon);
}

function fmtKM(km) {
  if (km == null || km === '') return '—';
  return Number(km).toLocaleString('id-ID') + ' KM';
}

function fmtTanggal(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ── Foto uploader ────────────────────────────────────────────── */
function PhotoUploader({ photos, onAdd, onRemove }) {
  const ref = useRef();
  const handleFile = e => {
    Array.from(e.target.files).forEach(file => {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} maks 10MB`); return; }
      const r = new FileReader();
      r.onload = ev => onAdd({ id: crypto.randomUUID(), name: file.name, type: file.type, data: ev.target.result, size: file.size });
      r.readAsDataURL(file);
    });
    e.target.value = '';
  };
  return (
    <div>
      <input ref={ref} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={handleFile}/>
      <button type="button" onClick={() => ref.current?.click()}
        className="w-full border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-amber-400 rounded-2xl p-6 flex flex-col items-center gap-2 transition-colors">
        <Upload size={20} className="text-amber-400"/>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Klik untuk upload foto / PDF</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">JPG, PNG, PDF • Maks 10MB</p>
      </button>
      {photos.length > 0 && (
        <div className="mt-3 space-y-2">
          {photos.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              {p.type?.startsWith('image/') ? <img src={p.data} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" alt={p.name}/> : <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-red-400">PDF</div>}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{p.name}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">{(p.size/1024).toFixed(0)} KB</p>
              </div>
              <button type="button" onClick={() => onRemove(p.id)} className="text-red-400 hover:text-red-600 dark:hover:text-red-400 flex-shrink-0"><X size={15}/></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, required, error, hint, children }) {
  return (
    <div>
      {label && <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
      {children}
      {hint && !error && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{hint}</p>}
      {error && <p className="flex items-center gap-1 text-xs text-red-500 mt-1"><AlertCircle size={10}/> {error}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ItemKMSection — Riwayat KM PER ITEM (opsional)
   ═══════════════════════════════════════════════════════════════ */
function ItemKMSection({ item, kmCache, onItemUpdate }) {
  const hasArsip = kmCache?.hasArsip;
  const loading  = kmCache?.loading;

  // Nilai efektif untuk KM terakhir: dari arsip jika ada, atau manual
  const kmTerakhirEf = hasArsip ? kmCache.kmTerakhir : (parseInt(item.km_manual) || null);
  const tglTerakhirEf = hasArsip ? kmCache.tanggalTerakhir : (item.tgl_manual || null);
  const kmSekarang   = parseInt(item.km_pengajuan) || null;
  const selisih      = kmSekarang && kmTerakhirEf != null ? kmSekarang - kmTerakhirEf : null;

  return (
    <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5 mt-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Riwayat KM (opsional)</span>
        {loading && <Loader size={11} className="text-amber-400 animate-spin"/>}
      </div>
      <div className="space-y-1 text-xs bg-slate-50 dark:bg-slate-800/60 rounded-lg px-2.5 py-2 border border-slate-100 dark:border-slate-800">
        {/* a. Tanggal terakhir */}
        <div className="flex items-center gap-2">
          <span className="w-28 text-slate-500 dark:text-slate-400 flex-shrink-0 text-[11px]">a. Tgl Terakhir</span>
          {hasArsip ? (
            <>
              <span className="flex-1 font-semibold text-slate-700 dark:text-slate-200 truncate text-[11px]">
                {fmtTanggal(tglTerakhirEf)}{kmCache?.nomorTerakhir ? ` (${kmCache.nomorTerakhir})` : ''}
              </span>
              <span className="bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">AUTO</span>
            </>
          ) : (
            <>
              <input type="date" value={item.tgl_manual || ''} onChange={e => onItemUpdate(item.id, 'tgl_manual', e.target.value)}
                className="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 text-[11px] text-slate-800 dark:text-slate-100 outline-none focus:border-amber-400"/>
              <span className="bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">ISI</span>
            </>
          )}
        </div>

        {/* b. KM terakhir */}
        <div className="flex items-center gap-2">
          <span className="w-28 text-slate-500 dark:text-slate-400 flex-shrink-0 text-[11px]">b. KM Terakhir</span>
          {hasArsip ? (
            <>
              <span className="flex-1 font-semibold text-slate-700 dark:text-slate-200 text-[11px]">{fmtKM(kmCache.kmTerakhir)}</span>
              <span className="bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">AUTO</span>
            </>
          ) : (
            <>
              <input type="number" value={item.km_manual || ''} onChange={e => onItemUpdate(item.id, 'km_manual', e.target.value)} placeholder="Contoh: 15000"
                className="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 text-[11px] text-slate-800 dark:text-slate-100 outline-none focus:border-amber-400 placeholder:text-slate-300 dark:placeholder:text-slate-600"/>
              <span className="bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">ISI</span>
            </>
          )}
        </div>

        {/* c. KM saat pengajuan (selalu input) */}
        <div className="flex items-center gap-2">
          <span className="w-28 text-slate-500 dark:text-slate-400 flex-shrink-0 text-[11px]">c. KM Sekarang</span>
          <input type="number" value={item.km_pengajuan || ''} onChange={e => onItemUpdate(item.id, 'km_pengajuan', e.target.value)} placeholder="opsional"
            className="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 text-[11px] text-slate-800 dark:text-slate-100 outline-none focus:border-amber-400 placeholder:text-slate-300 dark:placeholder:text-slate-600"/>
          <span className="bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">ISI</span>
        </div>

        {/* d. Selisih */}
        <div className="flex items-center gap-2">
          <span className="w-28 text-slate-500 dark:text-slate-400 flex-shrink-0 text-[11px]">d. Selisih KM</span>
          <span className={`flex-1 font-bold text-[11px] ${selisih != null ? selisih >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500' : 'text-slate-400 dark:text-slate-500 italic'}`}>
            {selisih != null ? `${selisih >= 0 ? '+' : ''}${selisih.toLocaleString('id-ID')} KM` : '—'}
          </span>
          <span className="bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">AUTO</span>
        </div>

        {/* Info banner jika arsip kosong */}
        {!loading && !hasArsip && item.penjelasan?.trim() && (
          <p className="text-[9.5px] text-amber-600 dark:text-amber-400 italic pt-1">
            Tidak ada riwayat di arsip untuk item serupa di plat ini. Bisa diisi manual atau dibiarkan kosong.
          </p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ItemRow & ItemsSection — DI LUAR main component
   ═══════════════════════════════════════════════════════════════ */
// v23: daftar Jenis Pembelian tetap
const JENIS_KENDARAAN = [
  'Beban Suku Cadang',
  'Beban Perbaikan',
  'Beban Perawatan',
  'Beban Perbaikan dan Suku Cadang',
  'Beban Perawatan dan Suku Cadang',
  'Beban Perlengkapan Kendaraan',
  'Beban Perbaikan dan Perlengkapan Kendaraan',
  'Beban Perbaikan Box',
  'Beban Pengiriman Barang',
  'Beban Izin Kendaraan',
  'Beban Parkir',
  'Beban BBM',
];
const JENIS_UMUM = [
  'Beban Izin Kendaraan',
  'Beban Dana Sosial',
  'Beban Sewa Kendaraan',
  'Beban Perlengkapan Kendaraan',
  'Beban Entertain',
  'Beban ATK',
  'Beban Pengiriman Barang',
  'Beban Bongkar',
  'Beban Parkir',
];
// Daftar Cabang/Project — tambah manual di sini jika ada cabang baru
const CABANG_LIST = [
  'APLPKU','APLBDO','APLPDG','APLDJB','APLMES','APLPLM','PVPLM','PVMES','PVPKU','PVTKG','PVSUB','DHSCBT','NIC'
];

function ItemRow({ item, idx, totalItems, vendorNum, onUpdate, onRemove, onBlurPenjelasan, kmCache, errors, isUmum, suggestions = [] }) {
  const eb = `item${vendorNum}_${idx}`;
  const handlePenjelasan = useCallback(e => onUpdate(item.id, 'penjelasan', e.target.value), [item.id, onUpdate]);
  const handleSatuan     = useCallback(e => onUpdate(item.id, 'satuan',     e.target.value), [item.id, onUpdate]);
  const handleHarga      = useCallback(e => onUpdate(item.id, 'harga',      e.target.value), [item.id, onUpdate]);
  const handleDiskon     = useCallback(e => onUpdate(item.id, 'diskon',     e.target.value), [item.id, onUpdate]);
  const handleBlur       = useCallback(() => {
    onBlurPenjelasan(item.id, item.penjelasan);
    if (!item.kategori_biaya) {
      const g = guessKategori(item.penjelasan);
      if (g) onUpdate(item.id, 'kategori_biaya', g);
    }
  }, [item.id, item.penjelasan, item.kategori_biaya, onBlurPenjelasan, onUpdate]);

  // v17: combobox autocomplete penjelasan (saran dari item kendaraan terpilih)
  const [openSug, setOpenSug] = useState(false);
  const norm = (v) => (v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const q = norm(item.penjelasan);
  const filteredSug = (suggestions || [])
    .filter(sg => {
      const n = norm(sg.penjelasan);
      if (!n) return false;
      if (n === q) return false;          // sudah sama persis → tak perlu disarankan
      return q ? n.includes(q) : true;    // kosong → tampilkan semua
    })
    .slice(0, 8);
  const pickSug = useCallback((sg) => {
    onUpdate(item.id, 'penjelasan', sg.penjelasan);
    if (!item.kategori_biaya && sg.kategori_biaya) onUpdate(item.id, 'kategori_biaya', sg.kategori_biaya);
    onBlurPenjelasan(item.id, sg.penjelasan);   // ambil KM (cocok sama-persis)
    setOpenSug(false);
  }, [item.id, item.kategori_biaya, onUpdate, onBlurPenjelasan]);

  const itemTotal = calcItemTotal(item);

  return (
    <div className={`border rounded-xl p-3 space-y-2 ${errors[`${eb}_pen`]||errors[`${eb}_sat`]||errors[`${eb}_hrg`]?'border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10':'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'}`}>
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">ITEM {idx + 1}</span>
        {totalItems > 1 && <button type="button" onMouseDown={e=>e.preventDefault()} onClick={() => onRemove(item.id)} className="text-red-400 hover:text-red-600 dark:hover:text-red-400"><Trash2 size={13}/></button>}
      </div>
      <div className="relative">
        <textarea
          value={item.penjelasan}
          onChange={e=>{handlePenjelasan(e); setOpenSug(true);}}
          onFocus={()=>setOpenSug(true)}
          onBlur={()=>{ setTimeout(()=>setOpenSug(false), 120); handleBlur(); }}
          rows={2}
          placeholder="Ketik / pilih item..."
          className={`w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 dark:text-slate-100 dark:bg-slate-900 outline-none resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 transition-colors leading-relaxed ${errors[`${eb}_pen`]?'border-red-300 dark:border-red-500/40':'border-slate-200 dark:border-slate-700 focus:border-amber-400'}`}/>
        {openSug && !isUmum && filteredSug.length > 0 && (
          <div className="absolute z-30 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
            {filteredSug.map((sg, i) => (
              <button
                key={i} type="button"
                onMouseDown={e=>e.preventDefault()}
                onClick={()=>pickSug(sg)}
                className="w-full text-left px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-500/10 border-b border-slate-50 dark:border-slate-800 last:border-0">
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug">{sg.penjelasan}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {sg.nomor_pengajuan}{sg.km_pengajuan != null ? ` · KM ${fmtKM(sg.km_pengajuan)}` : ''}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-5 gap-2">
        <input value={item.satuan} onChange={handleSatuan} placeholder="Jumlah"
          className={`col-span-2 px-3 py-2.5 rounded-xl border text-sm text-slate-800 dark:text-slate-100 dark:bg-slate-900 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 ${errors[`${eb}_sat`]?'border-red-300 dark:border-red-500/40':'border-slate-200 dark:border-slate-700 focus:border-amber-400'}`}/>
        <div className="col-span-3 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500 pointer-events-none">Rp</span>
          <input type="number" value={item.harga} onChange={handleHarga} placeholder="0"
            className={`w-full pl-8 pr-3 py-2.5 rounded-xl border text-sm text-slate-800 dark:text-slate-100 dark:bg-slate-900 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 ${errors[`${eb}_hrg`]?'border-red-300 dark:border-red-500/40':'border-slate-200 dark:border-slate-700 focus:border-amber-400'}`}/>
        </div>
      </div>
      {/* Diskon nominal per item (opsional) */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500 pointer-events-none">Diskon Rp</span>
        <input type="number" value={item.diskon || ''} onChange={handleDiskon} placeholder="0 (opsional)"
          className="w-full pl-20 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 text-sm text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 focus:border-amber-400"/>
      </div>
      {/* Kategori biaya — memetakan ke kolom laporan Excel perusahaan (disembunyikan utk pengajuan umum) */}
      {!isUmum && (
      <select
        value={item.kategori_biaya || ''}
        onChange={e => onUpdate(item.id, 'kategori_biaya', e.target.value)}
        className={`w-full px-3 py-2 rounded-xl border text-sm dark:bg-slate-900 outline-none focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 ${item.kategori_biaya ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'} ${errors[`${eb}_kat`] ? 'border-red-300 dark:border-red-500/40' : 'border-slate-200 dark:border-slate-700 focus:border-amber-400'}`}>
        <option value="">— Pilih kategori biaya —</option>
        {KATEGORI_BIAYA.map(k => <option key={k} value={k}>{k}</option>)}
      </select>
      )}
      {(parseFloat(item.harga) > 0) && (
        <div className="text-xs space-y-0.5">
          {parseFloat(item.diskon) > 0 && (
            <div className="flex items-center justify-between text-slate-400 dark:text-slate-500">
              <span>{`${parseFloat(item.satuan)||1} × ${fmtCurrency(parseFloat(item.harga)||0)}`}</span>
              <span>{fmtCurrency((parseFloat(item.satuan)||1)*(parseFloat(item.harga)||0))}</span>
            </div>
          )}
          {parseFloat(item.diskon) > 0 && (
            <div className="flex items-center justify-between text-rose-500">
              <span>Diskon</span>
              <span>− {fmtCurrency(parseFloat(item.diskon)||0)}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-slate-400 dark:text-slate-500">{parseFloat(item.diskon) > 0 ? 'Harga akhir' : (parseFloat(item.satuan) > 1 ? `${parseFloat(item.satuan)} × ${fmtCurrency(parseFloat(item.harga)||0)} =` : '')}</span>
            <span className="text-amber-500 font-semibold">{fmtCurrency(itemTotal)}</span>
          </div>
        </div>
      )}

      {/* Per-item KM section (disembunyikan utk pengajuan umum) */}
      {!isUmum && <ItemKMSection item={item} kmCache={kmCache} onItemUpdate={onUpdate}/>}
    </div>
  );
}

function ItemsSection({ items, total, vendorNum, errors, onUpdate, onAdd, onRemove, onBlurPenjelasan, itemKMCache, isUmum, suggestions }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Item / Rincian <span className="text-red-500">*</span></label>
        <button type="button" onMouseDown={e=>e.preventDefault()} onClick={onAdd} className="flex items-center gap-1 text-xs font-bold text-amber-500 hover:text-amber-600 dark:hover:text-amber-400"><Plus size={13}/> Tambah Item</button>
      </div>
      {items.map((item, idx) => (
        <ItemRow key={item.id} item={item} idx={idx} totalItems={items.length} vendorNum={vendorNum}
          errors={errors} onUpdate={onUpdate} onRemove={onRemove} onBlurPenjelasan={onBlurPenjelasan}
          kmCache={itemKMCache[item.id]} isUmum={isUmum} suggestions={suggestions}/>
      ))}
      <div className="flex justify-between items-center bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2.5">
        <span className="text-sm font-extrabold text-amber-800 dark:text-amber-300">TOTAL</span>
        <span className="text-base font-black text-amber-500">{fmtCurrency(total)}</span>
      </div>
    </div>
  );
}

const KATEGORI_BIAYA = ['Sewa', 'Service', 'Ban', 'Izin Kendaraan', 'Jasa', 'Lainnya'];

// Tebak kategori awal dari penjelasan (pemohon tetap bisa mengubah)
function guessKategori(text) {
  const t = (text || '').toLowerCase();
  if (/\bban\b|tambal|velg/.test(t)) return 'Ban';
  if (/izin|\bkir\b|keur|retribusi/.test(t)) return 'Izin Kendaraan';
  if (/sewa|rental|\brent\b/.test(t)) return 'Sewa';
  if (/servis|service|oli|\brem\b|kampas|aki|filter|lahar|bearing|gigi|gear|kopling|radiator|busi|seal|shock/.test(t)) return 'Service';
  if (/\bjasa\b|ongkos|upah|tukang/.test(t)) return 'Jasa';
  return '';
}

const newItem = () => ({
  id: crypto.randomUUID(),
  penjelasan: '', satuan: '', harga: '', diskon: '',
  km_pengajuan: '',   // KM saat pengajuan (opsional)
  kategori_biaya: '', // Kategori biaya (wajib) — utk laporan master data
  km_manual: '',      // KM terakhir manual jika arsip kosong
  tgl_manual: '',     // Tanggal terakhir manual jika arsip kosong
});

/* ═══════════════════════════════════════════════════════════════ */
export default function NewFormPage() {
  const { user }  = useAuthStore();
  const navigate  = useNavigate();
  const [step, setStep]       = useState(0);
  // Deteksi pengajuan ganda — memperingatkan, tidak memblokir
  const [duplikat, setDuplikat] = useState([]);
  const [cekDup, setCekDup]     = useState(false);
  const [loading, setLoading] = useState(false);
  // ── Mode Revisi: NewFormPage dipakai ulang untuk mengedit snapshot revisi ──
  const { id: revSubId, snapshotId } = useParams();
  const isRevision = !!snapshotId;
  const [revLoading, setRevLoading]       = useState(isRevision);
  const [revNumber, setRevNumber]         = useState(null);
  const [preservedItems2, setPreservedItems2] = useState([]); // item Vendor 2 dipertahankan apa adanya
  const [photos, setPhotos]   = useState([]);
  const [errors, setErrors]   = useState({});

  // v12: Dropdown plat dari Master Kendaraan (+ opsi plat baru)
  const [platList, setPlatList] = useState([]);   // plat aktif dari master
  const [platBaru, setPlatBaru] = useState(false); // mode input plat baru
  useEffect(() => {
    vehicleAPI.list()
      .then(res => setPlatList((res.data?.data || []).filter(v => v.is_active).map(v => v.plat)))
      .catch(() => setPlatList([])); // master kosong/gagal → fallback ketik manual
  }, []);

  // Cache KM history per item.id
  // { [itemId]: { loading, hasArsip, kmTerakhir, tanggalTerakhir, nomorTerakhir } }
  const [itemKMCache, setItemKMCache] = useState({});

  // v17: daftar item yg pernah diajukan utk kendaraan terpilih (untuk autocomplete)
  const [itemSuggestions, setItemSuggestions] = useState([]);

  const [form, setForm] = useState({
    type:'PR', nomorUrut:'', cabangManual: user?.cabang||'',
    is_umum:false,
    kendaraan:'', jenis_pembelian:'',
    vendor:'', npwp:'', rekening_tujuan:'',
    items1:[newItem()],
    useVendor2:false, vendor2:'', npwp2:'', items2:[newItem()],
    alasan:'', alasan_type:'', batas_waktu_dana:'', batas_akhir_pembayaran:'',
    ppn:'', pph23:'',
    kmMassal:'',
  });

  const set = useCallback((k, v) => { setForm(f=>({...f,[k]:v})); setErrors(e=>({...e,[k]:''})); }, []);

  // v17: muat daftar item untuk autocomplete tiap kali kendaraan berubah
  useEffect(() => {
    const plat = form.kendaraan?.trim();
    if (form.is_umum || !plat) { setItemSuggestions([]); return; }
    let aktif = true;
    historyAPI.getVehicleItems(plat)
      .then(res => { if (aktif) setItemSuggestions(res.data?.data || []); })
      .catch(() => { if (aktif) setItemSuggestions([]); });
    return () => { aktif = false; };
  }, [form.kendaraan, form.is_umum]);

  // Fetch KM untuk item tertentu, berdasarkan plat + penjelasan
  const fetchItemKM = useCallback(async (itemId, plat, keyword) => {
    if (!plat?.trim() || !keyword?.trim()) {
      setItemKMCache(c => ({ ...c, [itemId]: { loading: false, hasArsip: false } }));
      return;
    }
    setItemKMCache(c => ({ ...c, [itemId]: { ...c[itemId], loading: true } }));
    try {
      const { data: res } = await historyAPI.getLastKM(plat.trim(), keyword);
      if (res?.data) {
        setItemKMCache(c => ({
          ...c,
          [itemId]: {
            loading: false, hasArsip: true,
            kmTerakhir: res.data.km_pengajuan,
            tanggalTerakhir: res.data.tanggal,
            nomorTerakhir: res.data.nomor_pengajuan,
          }
        }));
      } else {
        setItemKMCache(c => ({ ...c, [itemId]: { loading: false, hasArsip: false } }));
      }
    } catch {
      setItemKMCache(c => ({ ...c, [itemId]: { loading: false, hasArsip: false } }));
    }
  }, []);

  // Handler saat user blur dari textarea penjelasan
  const handleBlurPenjelasan1 = useCallback((itemId, penjelasan) => {
    if (penjelasan?.trim() && form.kendaraan?.trim()) fetchItemKM(itemId, form.kendaraan, penjelasan);
  }, [form.kendaraan, fetchItemKM]);
  const handleBlurPenjelasan2 = useCallback((itemId, penjelasan) => {
    if (penjelasan?.trim() && form.kendaraan?.trim()) fetchItemKM(itemId, form.kendaraan, penjelasan);
  }, [form.kendaraan, fetchItemKM]);

  // Item handlers
  const updateItem1 = useCallback((id,f,v)=>setForm(s=>({...s,items1:s.items1.map(it=>it.id===id?{...it,[f]:v}:it)})),[]);
  const updateItem2 = useCallback((id,f,v)=>setForm(s=>({...s,items2:s.items2.map(it=>it.id===id?{...it,[f]:v}:it)})),[]);
  const addItem1    = useCallback(()=>setForm(s=>({...s,items1:[...s.items1,{...newItem(),km_pengajuan:s.kmMassal||''}]})),[]);
  const addItem2    = useCallback(()=>setForm(s=>({...s,items2:[...s.items2,{...newItem(),km_pengajuan:s.kmMassal||''}]})),[]);
  // KM massal: mengetik di field utama menyalin KM ke semua item (Vendor 1 & 2)
  const setKmMassal = useCallback((v)=>setForm(s=>({
    ...s, kmMassal:v,
    items1:s.items1.map(it=>({...it,km_pengajuan:v})),
    items2:s.items2.map(it=>({...it,km_pengajuan:v})),
  })),[]);
  const removeItem1 = useCallback((id)=>{
    setForm(s=>({...s,items1:s.items1.filter(it=>it.id!==id)}));
    setItemKMCache(c => { const n = {...c}; delete n[id]; return n; });
  },[]);
  const removeItem2 = useCallback((id)=>{
    setForm(s=>({...s,items2:s.items2.filter(it=>it.id!==id)}));
    setItemKMCache(c => { const n = {...c}; delete n[id]; return n; });
  },[]);

  const total1 = form.items1.reduce((s,i)=>s+calcItemTotal(i),0);
  const total2 = form.items2.reduce((s,i)=>s+calcItemTotal(i),0);
  const previewNomor = buildNomor(form.nomorUrut||'###', form.type, form.cabangManual||'CABANG');

  // Build riwayat dari semua items yang punya data KM
  const buildRiwayat = () => {
    const allItems = [
      ...form.items1.map((i, idx) => ({ ...i, vendorNum: 1, idx })),
      ...(form.useVendor2 ? form.items2.map((i, idx) => ({ ...i, vendorNum: 2, idx })) : []),
    ];

    const lines = [];
    let counter = 0;

    allItems.forEach(item => {
      const cache         = itemKMCache[item.id] || {};
      const hasArsip      = cache.hasArsip;
      const kmTerakhirEf  = hasArsip ? cache.kmTerakhir : (parseInt(item.km_manual) || null);
      const tglTerakhirEf = hasArsip ? cache.tanggalTerakhir : (item.tgl_manual || null);
      const kmSekarang    = parseInt(item.km_pengajuan) || null;

      // Skip item yang tidak punya data KM apapun
      if (!kmSekarang && !kmTerakhirEf && !tglTerakhirEf) return;

      counter++;
      const selisih = kmSekarang && kmTerakhirEf != null ? kmSekarang - kmTerakhirEf : null;
      const sumber  = hasArsip ? (cache.nomorTerakhir ? ` (${cache.nomorTerakhir})` : '') : ' (manual)';

      lines.push(`${counter}. ${item.penjelasan || '(tanpa penjelasan)'}`);
      lines.push(`   a. Tgl Terakhir : ${tglTerakhirEf ? fmtTanggal(tglTerakhirEf) + sumber : '—'}`);
      lines.push(`   b. KM Terakhir  : ${kmTerakhirEf != null ? fmtKM(kmTerakhirEf) : '—'}`);
      lines.push(`   c. KM Sekarang  : ${kmSekarang != null ? fmtKM(kmSekarang) : '—'}`);
      lines.push(`   d. Selisih KM   : ${selisih != null ? `${selisih >= 0 ? '+' : ''}${selisih.toLocaleString('id-ID')} KM` : '—'}`);
      lines.push('');
    });

    if (!lines.length) return '(Tidak ada riwayat KM yang diisi)';
    return lines.join('\n').trim();
  };

  const validate = s => {
    const e = {};
    if (s===0) { if (!form.nomorUrut.trim()) e.nomorUrut='Wajib'; if (!form.cabangManual.trim()) e.cabangManual='Wajib'; }
    if (s===1) {
      if (!form.is_umum && !form.kendaraan.trim()) e.kendaraan='Wajib';
      if (!form.jenis_pembelian.trim()) e.jenis_pembelian='Wajib';
      if (!form.alasan.trim())          e.alasan='Wajib';
      if (!form.batas_waktu_dana.trim())  e.batas_waktu_dana='Wajib';
      if (!form.batas_akhir_pembayaran)   e.batas_akhir_pembayaran='Wajib';
    }
    if (s===2) {
      if (!form.vendor.trim()) e.vendor='Wajib';
      form.items1.forEach((it,i) => {
        if (!it.penjelasan.trim()) e[`item1_${i}_pen`]='Wajib';
        if (!it.satuan.trim())     e[`item1_${i}_sat`]='Wajib';
        if (!form.is_umum && !it.kategori_biaya) e[`item1_${i}_kat`]='Wajib';
        if (!it.harga||parseFloat(it.harga)<=0) e[`item1_${i}_hrg`]='Wajib';
      });
    }
    if (s===3&&form.useVendor2) {
      if (!form.vendor2.trim()) e.vendor2='Wajib';
      form.items2.forEach((it,i) => {
        if (!it.penjelasan.trim()) e[`item2_${i}_pen`]='Wajib';
        if (!it.satuan.trim())     e[`item2_${i}_sat`]='Wajib';
        if (!form.is_umum && !it.kategori_biaya) e[`item2_${i}_kat`]='Wajib';
        if (!it.harga||parseFloat(it.harga)<=0) e[`item2_${i}_hrg`]='Wajib';
      });
    }
    if (s===4&&photos.length===0) e.photos='Minimal 1 foto wajib';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Cek kemungkinan pengajuan ganda (kendaraan/cabang sama + item mirip, 30 hari terakhir)
  const cekDuplikat = useCallback(async () => {
    if (isRevision) return;                       // revisi bukan pengajuan baru
    const items = form.items1.filter(i => i.penjelasan?.trim());
    if (!items.length) { setDuplikat([]); return; }
    if (!form.is_umum && !form.kendaraan?.trim()) { setDuplikat([]); return; }
    if (form.is_umum && !form.cabangManual?.trim()) { setDuplikat([]); return; }
    setCekDup(true);
    try {
      const { data } = await submissionAPI.checkDuplicate({
        kendaraan: form.kendaraan, cabang: form.cabangManual,
        jenis_pembelian: form.jenis_pembelian, is_umum: form.is_umum,
        items: items.map(i => ({ penjelasan: i.penjelasan })),
      });
      setDuplikat(data?.data || []);
    } catch { setDuplikat([]); }
    finally { setCekDup(false); }
  }, [form.items1, form.kendaraan, form.cabangManual, form.jenis_pembelian, form.is_umum, isRevision]);

  const handleNext = () => { if (!validate(step)){toast.error('Lengkapi field yang wajib');return;} if(isRevision){ if(step===1){setStep(2);} return; } if(step===2){cekDuplikat();} if(step===3&&!form.useVendor2){setStep(4);return;} setStep(s=>s+1); };
  const handleBack = () => { setErrors({}); if(isRevision){ if(step===2){setStep(1);} else {navigate(-1);} return; } if(step===4&&!form.useVendor2){setStep(2);return;} setStep(s=>s-1); };

  // Pre-fill dari submission (konteks) + snapshot (data revisi) saat mode revisi
  useEffect(() => {
    if (!isRevision) return;
    let alive = true;
    (async () => {
      try {
        const [subRes, revRes] = await Promise.all([
          submissionAPI.getOne(revSubId),
          revisionAPI.list(revSubId),
        ]);
        if (!alive) return;
        const sub  = subRes.data.data;
        const snap = (revRes.data.data || []).find(r => String(r.id) === String(snapshotId));
        if (!snap) { toast.error('Revisi tidak ditemukan'); navigate(`/submissions/${revSubId}`); return; }
        setRevNumber(snap.revision_number);
        const allItems = snap.items || [];
        const v1 = allItems.filter(i => i.vendor_num !== 2);
        const v2 = allItems.filter(i => i.vendor_num === 2);
        setPreservedItems2(v2);
        const mapItem = i => ({
          id: crypto.randomUUID(),
          penjelasan: i.penjelasan || '', satuan: i.satuan || '',
          harga:  i.harga  != null ? String(i.harga)  : '',
          diskon: i.diskon ? String(i.diskon) : '',
          km_pengajuan: i.km_pengajuan != null ? String(i.km_pengajuan) : '',
          kategori_biaya: i.kategori_biaya || '',
          km_manual: '', tgl_manual: '',
        });
        const items1 = v1.length ? v1.map(mapItem) : [newItem()];
        setForm(f => ({
          ...f,
          type: sub.type || 'PR', is_umum: !!sub.is_umum,
          kendaraan: sub.kendaraan || '', jenis_pembelian: sub.jenis_pembelian || '',
          alasan: snap.alasan || '', alasan_type: sub.alasan_type || '',
          pph23: snap.pph23 || '',
          ppn: snap.ppn != null && snap.ppn !== '' ? String(snap.ppn) : '',
          vendor: snap.vendor || '', npwp: snap.npwp || '', rekening_tujuan: snap.rekening_tujuan || '',
          vendor2: snap.vendor2 || '', npwp2: snap.npwp2 || '', useVendor2: v2.length > 0,
          batas_waktu_dana: sub.batas_waktu_dana || '', batas_akhir_pembayaran: sub.batas_akhir_pembayaran || '',
          items1, items2: v2.length ? v2.map(mapItem) : [newItem()],
        }));
        setStep(1);
        // Isi cache KM arsip per item agar riwayat tersusun lengkap (spt pengajuan asli)
        if (!sub.is_umum && sub.kendaraan) {
          items1.forEach(it => { if (it.penjelasan) fetchItemKM(it.id, sub.kendaraan, it.penjelasan); });
        }
      } catch {
        if (alive) toast.error('Gagal memuat data revisi');
      } finally {
        if (alive) setRevLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [isRevision, revSubId, snapshotId]); // eslint-disable-line

  const submit = async () => {
    if (!validate(step)){toast.error('Lengkapi field yang wajib');return;}
    setLoading(true);
    try {
      const riwayat = form.is_umum ? '' : buildRiwayat();

      // ── MODE REVISI: simpan ke snapshot, bukan buat pengajuan baru ──
      if (isRevision) {
        const itemsV1 = form.items1.map(i => ({
          penjelasan:i.penjelasan, satuan:i.satuan, vendor_num:1,
          harga:parseFloat(i.harga)||0, diskon:parseFloat(i.diskon)||0, total:calcItemTotal(i),
          km_pengajuan: parseInt(i.km_pengajuan) || null, kategori_biaya: i.kategori_biaya || 'Lainnya',
        }));
        // Vendor 2 dipertahankan apa adanya (tidak diedit di layar revisi ini)
        const itemsV2 = preservedItems2.map(i => ({
          penjelasan:i.penjelasan, satuan:i.satuan, vendor_num:2,
          harga:Number(i.harga)||0, diskon:Number(i.diskon)||0, total:Number(i.total)||0,
          km_pengajuan: i.km_pengajuan != null ? Number(i.km_pengajuan) : null,
          kategori_biaya: i.kategori_biaya || 'Lainnya',
        }));
        const payload = {
          alasan: form.alasan, riwayat,
          vendor: form.vendor, npwp: form.npwp, rekening_tujuan: form.rekening_tujuan,
          vendor2: form.vendor2, npwp2: form.npwp2,
          ppn: parseFloat(form.ppn)||0, pph23: form.pph23||'',
          items: [...itemsV1, ...itemsV2],
        };
        await revisionAPI.editSnapshot(snapshotId, payload);
        await revisionAPI.submitSnapshot(snapshotId);
        toast.success('Revisi berhasil dikirim!');
        navigate(`/submissions/${revSubId}`);
        setLoading(false);
        return;
      }

      const nomor   = buildNomor(form.nomorUrut, form.type, form.cabangManual);
      const items   = [
        ...form.items1.map(i=>({
          penjelasan:i.penjelasan, satuan:i.satuan, vendor_num:1,
          harga:parseFloat(i.harga)||0, diskon:parseFloat(i.diskon)||0, total:calcItemTotal(i),
          km_pengajuan: parseInt(i.km_pengajuan) || null,
          km_manual: parseInt(i.km_manual) || null,
          tgl_manual: i.tgl_manual || null,
          kategori_biaya: i.kategori_biaya || 'Lainnya',
        })),
        ...(form.useVendor2?form.items2.map(i=>({
          penjelasan:i.penjelasan, satuan:i.satuan, vendor_num:2,
          harga:parseFloat(i.harga)||0, diskon:parseFloat(i.diskon)||0, total:calcItemTotal(i),
          km_pengajuan: parseInt(i.km_pengajuan) || null,
          km_manual: parseInt(i.km_manual) || null,
          tgl_manual: i.tgl_manual || null,
          kategori_biaya: i.kategori_biaya || 'Lainnya',
        })):[]),
      ];

      // Backwards-compat: simpan km_pengajuan submission-level dari item pertama yang punya KM
      const firstKM = items.find(i => i.km_pengajuan)?.km_pengajuan || null;

      const payload = {
        nomor_pengajuan:nomor, nomor_urut:form.nomorUrut, cabang_manual:form.cabangManual,
        type:form.type, is_umum:form.is_umum,
        kendaraan:form.is_umum?'':form.kendaraan, jenis_pembelian:form.jenis_pembelian,
        vendor:form.vendor, npwp:form.npwp, rekening_tujuan:form.rekening_tujuan,
        vendor2:form.useVendor2?form.vendor2:'', npwp2:form.useVendor2?form.npwp2:'',
        alasan:form.alasan, alasan_type:form.alasan_type, riwayat, km_pengajuan: firstKM,
        ppn: parseFloat(form.ppn)||0, pph23: form.pph23||'',
        batas_waktu_dana:form.batas_waktu_dana, batas_akhir_pembayaran:form.batas_akhir_pembayaran, items,
      };
      if (navigator.onLine) {
        const { data } = await submissionAPI.create(payload);
        if (photos.length>0) {
          toast.loading('Mengupload foto...', {id:'upload'});
          for (const p of photos) { try { await photoAPI.upload(data.id,{fileName:p.name,fileData:p.data,fileType:p.type}); } catch { toast.error(`Gagal upload: ${p.name}`); } }
          toast.dismiss('upload');
        }
        toast.success('Pengajuan berhasil dikirim!');
        navigate(`/submissions/${data.id}`);
      } else {
        offlineQueue.add(payload);
        toast.success('Tersimpan offline.');
        navigate('/submissions');
      }
    } catch (err) { toast.error(err.response?.data?.error||'Gagal mengirim'); }
    setLoading(false);
  };

  const ic = ek => `w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 dark:text-slate-100 dark:bg-slate-900 outline-none transition-colors placeholder:text-slate-300 dark:placeholder:text-slate-600 disabled:bg-slate-50 dark:disabled:bg-slate-800 focus:ring-2 ${errors[ek]?'border-red-300 dark:border-red-500/40 focus:border-red-400 focus:ring-red-50 dark:focus:ring-red-500/15':'border-slate-200 dark:border-slate-700 focus:border-amber-400 focus:ring-amber-100 dark:focus:ring-amber-500/20'}`;

  if (revLoading) return <div className="flex justify-center py-20"><Spinner size={32}/></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={()=>navigate(-1)} className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60"><ChevronLeft size={18} className="text-slate-600 dark:text-slate-300"/></button>
        <div>
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">{isRevision ? `Edit Revisi ke-${revNumber||''}` : 'Buat Pengajuan Baru'}</h1>
          <p className="text-xs text-slate-400 dark:text-slate-500">{isRevision ? `Langkah ${step===1?1:2}/2 · ${step===1?'Data & Keterangan':'Vendor & Item'}` : `Langkah ${step+1}/${STEPS.length}`}</p>
        </div>
      </div>

      <div className={`flex items-center overflow-x-auto pb-1 ${isRevision?'hidden':''}`}>
        {STEPS.map((s,i)=>(
          <div key={s} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i<step?'bg-emerald-500 text-white':i===step?'bg-amber-500 text-white':'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500'}`}>{i<step?<Check size={12}/>:i+1}</div>
              <span className={`text-[9px] mt-1 font-medium whitespace-nowrap ${i===step?'text-amber-500':'text-slate-400 dark:text-slate-500'}`}>{s}</span>
            </div>
            {i<STEPS.length-1&&<div className={`w-5 h-0.5 mx-1 mb-3 flex-shrink-0 ${i<step?'bg-emerald-400':'bg-slate-200 dark:bg-slate-700'}`}/>}
          </div>
        ))}
      </div>

      {/* Peringatan kemungkinan pengajuan ganda — muncul setelah langkah Vendor 1 */}
      {!isRevision && duplikat.length > 0 && step >= 3 && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-4">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">⚠ Kemungkinan pengajuan ganda</p>
          <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90 mb-3 leading-relaxed">
            {form.is_umum
              ? <>Cabang <b>{form.cabangManual}</b> punya pengajuan aktif dengan item serupa dalam 30 hari terakhir. Periksa dulu sebelum melanjutkan:</>
              : <>Kendaraan <b>{form.kendaraan}</b> punya pengajuan aktif dengan item serupa dalam 30 hari terakhir. Periksa dulu sebelum melanjutkan:</>}
          </p>
          <div className="space-y-2">
            {duplikat.map(d => (
              <div key={d.id} className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-500/30 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                    {d.nomor_pengajuan}
                    <span className="ml-1.5 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">{d.status}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {d.item_mirip.join(' · ')} · {fmtCurrency(d.total_harga)}
                    {d.pemohon ? ` · ${d.pemohon}` : ''}
                  </p>
                </div>
                <a href={`/submissions/${d.id}`} target="_blank" rel="noreferrer"
                  className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 whitespace-nowrap flex-shrink-0">
                  Buka →
                </a>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-amber-700/70 dark:text-amber-300/70 mt-2.5">
            Tetap boleh melanjutkan jika ini kebutuhan berbeda — peringatan ini juga terlihat oleh verifikator.
          </p>
        </div>
      )}
      {cekDup && !isRevision && step >= 3 && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">Memeriksa kemungkinan pengajuan ganda…</p>
      )}

      {step===0&&(
        <Card>
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4">Pilih Jenis Pengajuan</h2>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[['PR','Purchase Requisition','Permintaan pembelian rutin'],['PAR','Purchase Auth. Request','Otorisasi nilai besar']].map(([t,title,desc])=>(
              <button key={t} type="button" onClick={()=>set('type',t)} className={`p-4 rounded-2xl border-2 text-left transition-all ${form.type===t?'border-amber-500 bg-amber-50 dark:bg-amber-500/10':'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                <p className={`text-2xl font-black mb-1 ${form.type===t?'text-amber-500':'text-slate-300 dark:text-slate-600'}`}>{t}</p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-0.5">{title}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">{desc}</p>
              </button>
            ))}
          </div>
          {/* Pilihan Kendaraan/Umum — berlaku untuk PR maupun PAR (alur persetujuan tidak berubah) */}
          <div className="mb-5">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">Isi pengajuan untuk</p>
              <div className="grid grid-cols-2 gap-3">
                {[[false,'Perawatan Kendaraan','Dengan plat & riwayat KM'],[true,'Barang Kantor / Umum','ATK, aset — tanpa kendaraan']].map(([val,title,desc])=>(
                  <button key={String(val)} type="button" onClick={()=>{set('is_umum',val); set('jenis_pembelian','');}}
                    className={`p-3 rounded-2xl border-2 text-left transition-all ${form.is_umum===val?'border-amber-500 bg-amber-50 dark:bg-amber-500/10':'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                    <p className={`text-sm font-black mb-0.5 ${form.is_umum===val?'text-amber-600 dark:text-amber-400':'text-slate-500 dark:text-slate-400'}`}>{title}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-3">Format Nomor Pengajuan</p>
            <div className="bg-white dark:bg-slate-900 border-2 border-amber-300 dark:border-amber-500/40 rounded-xl px-4 py-2.5 mb-3 text-center">
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">Preview:</p>
              <p className="text-base font-black text-amber-600 dark:text-amber-400">{previewNomor}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nomor Urut" required error={errors.nomorUrut} hint="Contoh: 009"><input value={form.nomorUrut} onChange={e=>set('nomorUrut',e.target.value)} placeholder="009" className={ic('nomorUrut')}/></Field>
              <Field label="Cabang / Project" required error={errors.cabangManual}><select value={CABANG_LIST.includes(form.cabangManual) ? form.cabangManual : ''} onChange={e=>set('cabangManual',e.target.value)} className={ic('cabangManual')}><option value="" disabled>Pilih cabang...</option>{CABANG_LIST.map(c=><option key={c} value={c}>{c}</option>)}</select></Field>
            </div>
          </div>
        </Card>
      )}

      {step===1&&(
        <Card>
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4">{form.is_umum?'Data Pengajuan & Keterangan':'Data Kendaraan & Keterangan'}</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pemohon"><input value={user?.name} disabled className={ic('')}/></Field>
              <Field label="Jabatan"><input value={user?.jabatan||'—'} disabled className={ic('')}/></Field>
            </div>
            {!form.is_umum && (
            <Field label="Kendaraan / Plat Nomor" required error={errors.kendaraan} hint="Riwayat KM otomatis muncul saat isi item di langkah berikutnya">
              {platList.length > 0 && !platBaru ? (
                <select
                  value={platList.includes(form.kendaraan) ? form.kendaraan : ''}
                  onChange={e => {
                    if (e.target.value === '__new__') { setPlatBaru(true); set('kendaraan', ''); }
                    else set('kendaraan', e.target.value);
                  }}
                  disabled={isRevision}
                  className={`${ic('kendaraan')} bg-white dark:bg-slate-900 ${form.kendaraan ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>
                  <option value="">— Pilih kendaraan dari master —</option>
                  {platList.map(p => <option key={p} value={p}>{p}</option>)}
                  <option value="__new__">＋ Plat baru (belum terdaftar)…</option>
                </select>
              ) : (
                <div className="space-y-1">
                  <input value={form.kendaraan} onChange={e=>set('kendaraan',e.target.value.toUpperCase())} placeholder="BM 1234 ZZ" disabled={isRevision} className={ic('kendaraan')}/>
                  {platList.length > 0 && (
                    <button type="button" onClick={() => { setPlatBaru(false); set('kendaraan',''); }}
                      className="text-[10.5px] font-bold text-amber-500 hover:text-amber-600 dark:hover:text-amber-400">
                      ← Pilih dari daftar master
                    </button>
                  )}
                  {platBaru && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">
                      Plat baru otomatis terdaftar ke Master Kendaraan setelah pengajuan dikirim.
                    </p>
                  )}
                </div>
              )}
            </Field>
            )}
            <Field label="Jenis Pembelian" required error={errors.jenis_pembelian}>
              <select value={form.jenis_pembelian} onChange={e=>set('jenis_pembelian',e.target.value)} disabled={isRevision} className={ic('jenis_pembelian')}>
                <option value="">— Pilih Jenis Pembelian —</option>
                {(form.is_umum ? JENIS_UMUM : JENIS_KENDARAAN).map(j => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
            </Field>
            <Field label="Type" error={errors.alasan_type}>
              <input value={form.alasan_type} onChange={e=>set('alasan_type',e.target.value)} placeholder="Contoh: Revo Tahun 2010"
                disabled={isRevision} className={ic('alasan_type')}/>
            </Field>
            <Field label="Alasan Pengajuan" required error={errors.alasan}>
              <textarea value={form.alasan} onChange={e=>set('alasan',e.target.value)} rows={3} placeholder="Jelaskan alasan pengajuan..."
                className={`w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 dark:text-slate-100 dark:bg-slate-900 outline-none resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-colors leading-relaxed focus:ring-2 ${errors.alasan?'border-red-300 dark:border-red-500/40 focus:border-red-400 focus:ring-red-50 dark:focus:ring-red-500/15':'border-slate-200 dark:border-slate-700 focus:border-amber-400 focus:ring-amber-100 dark:focus:ring-amber-500/20'}`}/>
            </Field>
            <Field label="Pph23 (opsional)" hint="Teks bebas — tampil di detail & PDF, di bawah alasan">
              <textarea value={form.pph23} onChange={e=>set('pph23',e.target.value)} rows={2} placeholder="Contoh: Pph23 Rp.--- x 2% = ..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 text-sm text-slate-800 dark:text-slate-100 outline-none resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 leading-relaxed"/>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Batas Waktu Dana" required error={errors.batas_waktu_dana}><input value={form.batas_waktu_dana} onChange={e=>set('batas_waktu_dana',e.target.value)} placeholder="30 Hari" disabled={isRevision} className={ic('batas_waktu_dana')}/></Field>
              <Field label="Batas Akhir Pembayaran" required error={errors.batas_akhir_pembayaran}><input type="date" value={form.batas_akhir_pembayaran} onChange={e=>set('batas_akhir_pembayaran',e.target.value)} disabled={isRevision} className={ic('batas_akhir_pembayaran')}/></Field>
            </div>
          </div>
        </Card>
      )}

      {step===2&&(
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center"><span className="text-white text-[10px] font-black">1</span></div>
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">Vendor / Bengkel Pertama</h2>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nama Vendor *" error={errors.vendor}><input value={form.vendor} onChange={e=>set('vendor',e.target.value)} placeholder="Nama bengkel" className={ic('vendor')}/></Field>
                <Field label="NPWP/KTP (opsional)"><input value={form.npwp} onChange={e=>set('npwp',e.target.value)} placeholder="XX.XXX..." className={ic('')}/></Field>
              </div>
              <Field label="Rekening Tujuan Pembayaran" hint="Bank — Nomor a/n Nama">
                <textarea value={form.rekening_tujuan} onChange={e=>set('rekening_tujuan',e.target.value)} rows={2} placeholder="BCA — 1234567890 a/n Nama" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 text-sm text-slate-800 dark:text-slate-100 outline-none resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20"/>
              </Field>
              {!form.is_umum && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-xs font-bold text-amber-800 dark:text-amber-300">KM Kendaraan Saat Ini</p>
                      <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80">Diisi otomatis ke kolom KM semua item — tidak perlu isi berulang</p>
                    </div>
                    <input type="number" value={form.kmMassal} onChange={e=>setKmMassal(e.target.value)} placeholder="Contoh: 152400"
                      className="w-44 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20"/>
                  </div>
                  <p className="text-[10px] text-amber-700/60 dark:text-amber-300/60">KM per item tetap bisa diubah satu-satu bila ada yang berbeda.</p>
                </div>
              )}
              <ItemsSection items={form.items1} total={total1} vendorNum={1} errors={errors}
                onUpdate={updateItem1} onAdd={addItem1} onRemove={removeItem1}
                onBlurPenjelasan={handleBlurPenjelasan1} itemKMCache={itemKMCache} isUmum={form.is_umum}
                suggestions={itemSuggestions}/>
              {/* Ppn — satu nilai untuk seluruh pengajuan (opsional, menambah total) */}
              <div className="pt-3 mt-1 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Ppn (opsional)</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Nominal rupiah, menambah total</p>
                  </div>
                  <div className="relative w-40">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500 pointer-events-none">Rp</span>
                    <input type="number" value={form.ppn||''} onChange={e=>set('ppn',e.target.value)} placeholder="0"
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 text-sm text-right text-slate-800 dark:text-slate-100 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20"/>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Total Akhir (Vendor + Ppn)</span>
                  <span className="text-base font-black text-amber-500">{fmtCurrency(total1 + (parseFloat(form.ppn)||0))}</span>
                </div>
              </div>
            </div>
          </Card>
          {!form.is_umum&&form.kendaraan?.trim()&&<VehicleHistoryPanel kendaraan={form.kendaraan}/>}
        </div>
      )}

      {step===3&&(
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center"><span className="text-white text-[10px] font-black">2</span></div>
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">Vendor Pembanding <span className="text-slate-400 dark:text-slate-500 font-normal text-xs">(opsional)</span></h2>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl mb-4">
            <button type="button" onClick={()=>set('useVendor2',!form.useVendor2)} className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.useVendor2?'bg-amber-500':'bg-slate-300 dark:bg-slate-600'}`}>
              <div className={`w-5 h-5 bg-white dark:bg-slate-900 rounded-full shadow transition-transform mx-0.5 ${form.useVendor2?'translate-x-5':'translate-x-0'}`}/>
            </button>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Tambahkan Vendor Pembanding</p>
          </div>
          {form.useVendor2&&(
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nama Vendor 2 *" error={errors.vendor2}><input value={form.vendor2} onChange={e=>set('vendor2',e.target.value)} placeholder="Nama bengkel 2" className={ic('vendor2')}/></Field>
                <Field label="NPWP (opsional)"><input value={form.npwp2} onChange={e=>set('npwp2',e.target.value)} placeholder="Opsional" className={ic('')}/></Field>
              </div>
              <ItemsSection items={form.items2} total={total2} vendorNum={2} errors={errors}
                onUpdate={updateItem2} onAdd={addItem2} onRemove={removeItem2}
                onBlurPenjelasan={handleBlurPenjelasan2} itemKMCache={itemKMCache} isUmum={form.is_umum}
                suggestions={itemSuggestions}/>
            </div>
          )}
        </Card>
      )}

      {step===4&&(
        <Card>
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Lampiran Foto <span className="text-red-500">*</span></h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Minimal 1 foto wajib dilampirkan.</p>
          <PhotoUploader photos={photos} onAdd={p=>{setPhotos(prev=>[...prev,p]);setErrors(e=>({...e,photos:''}));}} onRemove={id=>setPhotos(prev=>prev.filter(p=>p.id!==id))}/>
          {errors.photos&&<p className="flex items-center gap-1 text-xs text-red-500 mt-2"><AlertCircle size={10}/> {errors.photos}</p>}
        </Card>
      )}

      {step===5&&(
        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Review & Konfirmasi</h2>
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3 mb-3"><p className="text-xs font-semibold text-amber-700 dark:text-amber-300">⚠ Periksa kembali semua data sebelum mengirim.</p></div>
            <div className="bg-slate-800 rounded-xl px-4 py-3 mb-3 text-center">
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1">Nomor Pengajuan</p>
              <p className="text-base font-black text-amber-400">{buildNomor(form.nomorUrut,form.type,form.cabangManual)}</p>
            </div>
            {[['Jenis',form.type],...(form.is_umum?[['Mode','Barang Kantor / Umum']]:[]),['Pemohon',user?.name],...(form.is_umum?[]:[['Kendaraan',form.kendaraan]]),['Jenis Pembelian',form.jenis_pembelian],['Vendor 1',form.vendor],...(form.rekening_tujuan?[['Rekening',form.rekening_tujuan]]:[]),['Total Vendor 1',fmtCurrency(total1)],...((parseFloat(form.ppn)||0)>0?[['Ppn',fmtCurrency(parseFloat(form.ppn)||0)],['Total Akhir',fmtCurrency(total1+(parseFloat(form.ppn)||0))]]:[]),...(form.useVendor2?[['Vendor 2',form.vendor2],['Total Vendor 2',fmtCurrency(total2)]]:[]),['Batas Waktu',form.batas_waktu_dana],['Batas Bayar',form.batas_akhir_pembayaran],['Foto',`${photos.length} foto`]].map(([k,v],i,arr)=>(
              <div key={k} className={`flex justify-between gap-4 py-2 ${i<arr.length-1?'border-b border-slate-50 dark:border-slate-800':''}`}>
                <span className="text-xs text-slate-400 dark:text-slate-500">{k}</span><span className="text-xs font-bold text-slate-700 dark:text-slate-200 text-right">{v}</span>
              </div>
            ))}
          </Card>
          <Card>
            {/* Rincian item — tampil untuk semua pengajuan (termasuk umum) */}
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Rincian Item</p>
            <div className="space-y-1.5 mb-4">
              {form.items1.map((it, i) => (
                <div key={`rv1-${i}`} className="flex justify-between gap-3 py-1.5 border-b border-slate-50 dark:border-slate-800 text-xs">
                  <span className="text-slate-700 dark:text-slate-200 min-w-0">
                    {it.penjelasan || '(tanpa nama)'}
                    <span className="text-slate-400 dark:text-slate-500"> · {parseFloat(it.satuan) || 1} × {fmtCurrency(parseFloat(it.harga) || 0)}{(parseFloat(it.diskon) || 0) > 0 ? ` − ${fmtCurrency(parseFloat(it.diskon))}` : ''}</span>
                  </span>
                  <span className="font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">{fmtCurrency(calcItemTotal(it))}</span>
                </div>
              ))}
              {form.useVendor2 && (
                <>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider pt-2">Vendor 2 — {form.vendor2 || '-'}</p>
                  {form.items2.map((it, i) => (
                    <div key={`rv2-${i}`} className="flex justify-between gap-3 py-1.5 border-b border-slate-50 dark:border-slate-800 text-xs">
                      <span className="text-slate-700 dark:text-slate-200 min-w-0">
                        {it.penjelasan || '(tanpa nama)'}
                        <span className="text-slate-400 dark:text-slate-500"> · {parseFloat(it.satuan) || 1} × {fmtCurrency(parseFloat(it.harga) || 0)}{(parseFloat(it.diskon) || 0) > 0 ? ` − ${fmtCurrency(parseFloat(it.diskon))}` : ''}</span>
                      </span>
                      <span className="font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">{fmtCurrency(calcItemTotal(it))}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Alasan pengajuan — tampil untuk semua */}
            {form.alasan_type?.trim() && (<>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Type</p>
            <div className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-700 mb-3">{form.alasan_type}</div>
            </>)}
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Alasan Pengajuan</p>
            <div className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-700 mb-4">{form.alasan?.trim() || '—'}</div>

            {form.pph23?.trim() && (<>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Pph23</p>
            <div className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-700 mb-4">{form.pph23}</div>
            </>)}

            {/* Riwayat KM — hanya pengajuan kendaraan */}
            {!form.is_umum && (<>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Preview Riwayat KM:</p>
            <div className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-700 font-mono">{buildRiwayat()}</div>
            </>)}
          </Card>
        </div>
      )}

      <div className="flex gap-3 pb-4">
        {step>0&&<Button variant="secondary" className="flex-1" onClick={handleBack}>← Kembali</Button>}
        {isRevision
          ? (step===2
              ? <Button variant="success" className="flex-1" onClick={submit} loading={loading}>✓ Kirim Revisi</Button>
              : <Button className="flex-1" onClick={handleNext}>Lanjut →</Button>)
          : (step<STEPS.length-1
              ? <Button className="flex-1" onClick={handleNext}>Lanjut →</Button>
              : <Button variant="success" className="flex-1" onClick={submit} loading={loading}>✓ Kirim Pengajuan</Button>)}
      </div>
    </div>
  );
}
