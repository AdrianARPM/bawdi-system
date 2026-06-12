// src/pages/NewFormPage.jsx  — v11
// Perubahan dari v10:
// 1. Riwayat KM SEKARANG PER-ITEM (tidak lagi global per submission)
// 2. Setiap ItemRow punya section KM-nya sendiri (opsional, tetap muncul)
// 3. Auto-fetch KM berdasarkan plat + penjelasan item saat user blur penjelasan
// 4. Jika arsip kosong, KM & tanggal terakhir bisa diisi manual per item
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Check, ChevronLeft, Upload, X, AlertCircle, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import { submissionAPI, photoAPI, historyAPI, offlineQueue } from '../utils/api';
import { Card, Button, fmtCurrency } from '../components/ui';
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
  const qty   = parseFloat(item.satuan) || 1;
  const harga = parseFloat(item.harga)  || 0;
  return qty * harga;
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
        className="w-full border-2 border-dashed border-slate-300 hover:border-amber-400 rounded-2xl p-6 flex flex-col items-center gap-2 transition-colors">
        <Upload size={20} className="text-amber-400"/>
        <p className="text-sm font-semibold text-slate-600">Klik untuk upload foto / PDF</p>
        <p className="text-xs text-slate-400">JPG, PNG, PDF • Maks 10MB</p>
      </button>
      {photos.length > 0 && (
        <div className="mt-3 space-y-2">
          {photos.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              {p.type?.startsWith('image/') ? <img src={p.data} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" alt={p.name}/> : <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0 text-xs font-bold text-red-400">PDF</div>}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{p.name}</p>
                <p className="text-[10px] text-slate-400">{(p.size/1024).toFixed(0)} KB</p>
              </div>
              <button type="button" onClick={() => onRemove(p.id)} className="text-red-400 hover:text-red-600 flex-shrink-0"><X size={15}/></button>
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
      {label && <label className="block text-xs font-bold text-slate-600 mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
      {children}
      {hint && !error && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
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
    <div className="border-t border-slate-200 pt-2.5 mt-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Riwayat KM (opsional)</span>
        {loading && <Loader size={11} className="text-amber-400 animate-spin"/>}
      </div>
      <div className="space-y-1 text-xs bg-slate-50 rounded-lg px-2.5 py-2 border border-slate-100">
        {/* a. Tanggal terakhir */}
        <div className="flex items-center gap-2">
          <span className="w-28 text-slate-500 flex-shrink-0 text-[11px]">a. Tgl Terakhir</span>
          {hasArsip ? (
            <>
              <span className="flex-1 font-semibold text-slate-700 truncate text-[11px]">
                {fmtTanggal(tglTerakhirEf)}{kmCache?.nomorTerakhir ? ` (${kmCache.nomorTerakhir})` : ''}
              </span>
              <span className="bg-blue-100 text-blue-600 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">AUTO</span>
            </>
          ) : (
            <>
              <input type="date" value={item.tgl_manual || ''} onChange={e => onItemUpdate(item.id, 'tgl_manual', e.target.value)}
                className="flex-1 px-2 py-1 rounded border border-slate-200 text-[11px] text-slate-800 outline-none focus:border-amber-400"/>
              <span className="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">ISI</span>
            </>
          )}
        </div>

        {/* b. KM terakhir */}
        <div className="flex items-center gap-2">
          <span className="w-28 text-slate-500 flex-shrink-0 text-[11px]">b. KM Terakhir</span>
          {hasArsip ? (
            <>
              <span className="flex-1 font-semibold text-slate-700 text-[11px]">{fmtKM(kmCache.kmTerakhir)}</span>
              <span className="bg-blue-100 text-blue-600 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">AUTO</span>
            </>
          ) : (
            <>
              <input type="number" value={item.km_manual || ''} onChange={e => onItemUpdate(item.id, 'km_manual', e.target.value)} placeholder="Contoh: 15000"
                className="flex-1 px-2 py-1 rounded border border-slate-200 text-[11px] text-slate-800 outline-none focus:border-amber-400 placeholder:text-slate-300"/>
              <span className="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">ISI</span>
            </>
          )}
        </div>

        {/* c. KM saat pengajuan (selalu input) */}
        <div className="flex items-center gap-2">
          <span className="w-28 text-slate-500 flex-shrink-0 text-[11px]">c. KM Sekarang</span>
          <input type="number" value={item.km_pengajuan || ''} onChange={e => onItemUpdate(item.id, 'km_pengajuan', e.target.value)} placeholder="opsional"
            className="flex-1 px-2 py-1 rounded border border-slate-200 text-[11px] text-slate-800 outline-none focus:border-amber-400 placeholder:text-slate-300"/>
          <span className="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">ISI</span>
        </div>

        {/* d. Selisih */}
        <div className="flex items-center gap-2">
          <span className="w-28 text-slate-500 flex-shrink-0 text-[11px]">d. Selisih KM</span>
          <span className={`flex-1 font-bold text-[11px] ${selisih != null ? selisih >= 0 ? 'text-emerald-600' : 'text-red-500' : 'text-slate-400 italic'}`}>
            {selisih != null ? `${selisih >= 0 ? '+' : ''}${selisih.toLocaleString('id-ID')} KM` : '—'}
          </span>
          <span className="bg-blue-100 text-blue-600 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">AUTO</span>
        </div>

        {/* Info banner jika arsip kosong */}
        {!loading && !hasArsip && item.penjelasan?.trim() && (
          <p className="text-[9.5px] text-amber-600 italic pt-1">
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
function ItemRow({ item, idx, totalItems, vendorNum, onUpdate, onRemove, onBlurPenjelasan, kmCache, errors }) {
  const eb = `item${vendorNum}_${idx}`;
  const handlePenjelasan = useCallback(e => onUpdate(item.id, 'penjelasan', e.target.value), [item.id, onUpdate]);
  const handleSatuan     = useCallback(e => onUpdate(item.id, 'satuan',     e.target.value), [item.id, onUpdate]);
  const handleHarga      = useCallback(e => onUpdate(item.id, 'harga',      e.target.value), [item.id, onUpdate]);
  const handleBlur       = useCallback(() => {
    onBlurPenjelasan(item.id, item.penjelasan);
    if (!item.kategori_biaya) {
      const g = guessKategori(item.penjelasan);
      if (g) onUpdate(item.id, 'kategori_biaya', g);
    }
  }, [item.id, item.penjelasan, item.kategori_biaya, onBlurPenjelasan, onUpdate]);
  const itemTotal = calcItemTotal(item);

  return (
    <div className={`border rounded-xl p-3 space-y-2 ${errors[`${eb}_pen`]||errors[`${eb}_sat`]||errors[`${eb}_hrg`]?'border-red-300 bg-red-50':'border-slate-200 bg-white'}`}>
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold text-slate-400">ITEM {idx + 1}</span>
        {totalItems > 1 && <button type="button" onMouseDown={e=>e.preventDefault()} onClick={() => onRemove(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={13}/></button>}
      </div>
      <textarea
        value={item.penjelasan}
        onChange={handlePenjelasan}
        onBlur={handleBlur}
        rows={2}
        placeholder="Penjelasan item..."
        className={`w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none resize-none placeholder:text-slate-300 focus:ring-2 focus:ring-amber-100 transition-colors leading-relaxed ${errors[`${eb}_pen`]?'border-red-300':'border-slate-200 focus:border-amber-400'}`}/>
      <div className="grid grid-cols-5 gap-2">
        <input value={item.satuan} onChange={handleSatuan} placeholder="Satuan"
          className={`col-span-2 px-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none placeholder:text-slate-300 focus:ring-2 focus:ring-amber-100 ${errors[`${eb}_sat`]?'border-red-300':'border-slate-200 focus:border-amber-400'}`}/>
        <div className="col-span-3 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">Rp</span>
          <input type="number" value={item.harga} onChange={handleHarga} placeholder="0"
            className={`w-full pl-8 pr-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none placeholder:text-slate-300 focus:ring-2 focus:ring-amber-100 ${errors[`${eb}_hrg`]?'border-red-300':'border-slate-200 focus:border-amber-400'}`}/>
        </div>
      </div>
      {/* Kategori biaya — memetakan ke kolom laporan Excel perusahaan */}
      <select
        value={item.kategori_biaya || ''}
        onChange={e => onUpdate(item.id, 'kategori_biaya', e.target.value)}
        className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-amber-100 ${item.kategori_biaya ? 'text-slate-800' : 'text-slate-400'} ${errors[`${eb}_kat`] ? 'border-red-300' : 'border-slate-200 focus:border-amber-400'}`}>
        <option value="">— Pilih kategori biaya —</option>
        {KATEGORI_BIAYA.map(k => <option key={k} value={k}>{k}</option>)}
      </select>
      {itemTotal > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">{parseFloat(item.satuan) > 1 && `${parseFloat(item.satuan)} × ${fmtCurrency(parseFloat(item.harga)||0)} =`}</span>
          <span className="text-amber-500 font-semibold">{fmtCurrency(itemTotal)}</span>
        </div>
      )}

      {/* Per-item KM section */}
      <ItemKMSection item={item} kmCache={kmCache} onItemUpdate={onUpdate}/>
    </div>
  );
}

function ItemsSection({ items, total, vendorNum, errors, onUpdate, onAdd, onRemove, onBlurPenjelasan, itemKMCache }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-600">Item / Rincian <span className="text-red-500">*</span></label>
        <button type="button" onMouseDown={e=>e.preventDefault()} onClick={onAdd} className="flex items-center gap-1 text-xs font-bold text-amber-500 hover:text-amber-600"><Plus size={13}/> Tambah Item</button>
      </div>
      {items.map((item, idx) => (
        <ItemRow key={item.id} item={item} idx={idx} totalItems={items.length} vendorNum={vendorNum}
          errors={errors} onUpdate={onUpdate} onRemove={onRemove} onBlurPenjelasan={onBlurPenjelasan}
          kmCache={itemKMCache[item.id]}/>
      ))}
      <div className="flex justify-between items-center bg-amber-50 rounded-xl px-3 py-2.5">
        <span className="text-sm font-extrabold text-amber-800">TOTAL</span>
        <span className="text-base font-black text-amber-500">{fmtCurrency(total)}</span>
      </div>
    </div>
  );
}

const KATEGORI_BIAYA = ['Sewa', 'Service', 'Ban', 'Izin Kendaraan', 'Lainnya'];

// Tebak kategori awal dari penjelasan (pemohon tetap bisa mengubah)
function guessKategori(text) {
  const t = (text || '').toLowerCase();
  if (/\bban\b|tambal|velg/.test(t)) return 'Ban';
  if (/izin|\bkir\b|keur|retribusi/.test(t)) return 'Izin Kendaraan';
  if (/sewa|rental|\brent\b/.test(t)) return 'Sewa';
  if (/servis|service|oli|\brem\b|kampas|aki|filter|lahar|bearing|gigi|gear|kopling|radiator|busi|seal|shock/.test(t)) return 'Service';
  return '';
}

const newItem = () => ({
  id: crypto.randomUUID(),
  penjelasan: '', satuan: '', harga: '',
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
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos]   = useState([]);
  const [errors, setErrors]   = useState({});

  // Cache KM history per item.id
  // { [itemId]: { loading, hasArsip, kmTerakhir, tanggalTerakhir, nomorTerakhir } }
  const [itemKMCache, setItemKMCache] = useState({});

  const [form, setForm] = useState({
    type:'PR', nomorUrut:'', cabangManual: user?.cabang||'',
    kendaraan:'', jenis_pembelian:'',
    vendor:'', npwp:'', rekening_tujuan:'',
    items1:[newItem()],
    useVendor2:false, vendor2:'', npwp2:'', items2:[newItem()],
    alasan:'', batas_waktu_dana:'', batas_akhir_pembayaran:'',
  });

  const set = useCallback((k, v) => { setForm(f=>({...f,[k]:v})); setErrors(e=>({...e,[k]:''})); }, []);

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
  const addItem1    = useCallback(()=>setForm(s=>({...s,items1:[...s.items1,newItem()]})),[]);
  const addItem2    = useCallback(()=>setForm(s=>({...s,items2:[...s.items2,newItem()]})),[]);
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
      if (!form.kendaraan.trim())       e.kendaraan='Wajib';
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
        if (!it.kategori_biaya)    e[`item1_${i}_kat`]='Wajib';
        if (!it.harga||parseFloat(it.harga)<=0) e[`item1_${i}_hrg`]='Wajib';
      });
    }
    if (s===3&&form.useVendor2) {
      if (!form.vendor2.trim()) e.vendor2='Wajib';
      form.items2.forEach((it,i) => {
        if (!it.penjelasan.trim()) e[`item2_${i}_pen`]='Wajib';
        if (!it.satuan.trim())     e[`item2_${i}_sat`]='Wajib';
        if (!it.kategori_biaya)    e[`item2_${i}_kat`]='Wajib';
        if (!it.harga||parseFloat(it.harga)<=0) e[`item2_${i}_hrg`]='Wajib';
      });
    }
    if (s===4&&photos.length===0) e.photos='Minimal 1 foto wajib';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => { if (!validate(step)){toast.error('Lengkapi field yang wajib');return;} if(step===3&&!form.useVendor2){setStep(4);return;} setStep(s=>s+1); };
  const handleBack = () => { setErrors({}); if(step===4&&!form.useVendor2){setStep(2);return;} setStep(s=>s-1); };

  const submit = async () => {
    if (!validate(step)){toast.error('Lengkapi field yang wajib');return;}
    setLoading(true);
    try {
      const nomor   = buildNomor(form.nomorUrut, form.type, form.cabangManual);
      const riwayat = buildRiwayat();
      const items   = [
        ...form.items1.map(i=>({
          penjelasan:i.penjelasan, satuan:i.satuan, vendor_num:1,
          harga:parseFloat(i.harga)||0, total:calcItemTotal(i),
          km_pengajuan: parseInt(i.km_pengajuan) || null,
          kategori_biaya: i.kategori_biaya || 'Lainnya',
        })),
        ...(form.useVendor2?form.items2.map(i=>({
          penjelasan:i.penjelasan, satuan:i.satuan, vendor_num:2,
          harga:parseFloat(i.harga)||0, total:calcItemTotal(i),
          km_pengajuan: parseInt(i.km_pengajuan) || null,
          kategori_biaya: i.kategori_biaya || 'Lainnya',
        })):[]),
      ];

      // Backwards-compat: simpan km_pengajuan submission-level dari item pertama yang punya KM
      const firstKM = items.find(i => i.km_pengajuan)?.km_pengajuan || null;

      const payload = {
        nomor_pengajuan:nomor, nomor_urut:form.nomorUrut, cabang_manual:form.cabangManual,
        type:form.type, kendaraan:form.kendaraan, jenis_pembelian:form.jenis_pembelian,
        vendor:form.vendor, npwp:form.npwp, rekening_tujuan:form.rekening_tujuan,
        vendor2:form.useVendor2?form.vendor2:'', npwp2:form.useVendor2?form.npwp2:'',
        alasan:form.alasan, riwayat, km_pengajuan: firstKM,
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

  const ic = ek => `w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-300 disabled:bg-slate-50 focus:ring-2 ${errors[ek]?'border-red-300 focus:border-red-400 focus:ring-red-50':'border-slate-200 focus:border-amber-400 focus:ring-amber-100'}`;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={()=>navigate(-1)} className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"><ChevronLeft size={18} className="text-slate-600"/></button>
        <div><h1 className="text-xl font-black text-slate-800">Buat Pengajuan Baru</h1><p className="text-xs text-slate-400">Langkah {step+1}/{STEPS.length}</p></div>
      </div>

      <div className="flex items-center overflow-x-auto pb-1">
        {STEPS.map((s,i)=>(
          <div key={s} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i<step?'bg-emerald-500 text-white':i===step?'bg-amber-500 text-white':'bg-slate-200 text-slate-400'}`}>{i<step?<Check size={12}/>:i+1}</div>
              <span className={`text-[9px] mt-1 font-medium whitespace-nowrap ${i===step?'text-amber-500':'text-slate-400'}`}>{s}</span>
            </div>
            {i<STEPS.length-1&&<div className={`w-5 h-0.5 mx-1 mb-3 flex-shrink-0 ${i<step?'bg-emerald-400':'bg-slate-200'}`}/>}
          </div>
        ))}
      </div>

      {step===0&&(
        <Card>
          <h2 className="text-sm font-bold text-slate-700 mb-4">Pilih Jenis Pengajuan</h2>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[['PR','Purchase Requisition','Permintaan pembelian rutin'],['PAR','Purchase Auth. Request','Otorisasi nilai besar']].map(([t,title,desc])=>(
              <button key={t} type="button" onClick={()=>set('type',t)} className={`p-4 rounded-2xl border-2 text-left transition-all ${form.type===t?'border-amber-500 bg-amber-50':'border-slate-200 hover:border-slate-300'}`}>
                <p className={`text-2xl font-black mb-1 ${form.type===t?'text-amber-500':'text-slate-300'}`}>{t}</p>
                <p className="text-xs font-bold text-slate-700 mb-0.5">{title}</p>
                <p className="text-[10px] text-slate-400">{desc}</p>
              </button>
            ))}
          </div>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <p className="text-xs font-bold text-slate-700 mb-3">Format Nomor Pengajuan</p>
            <div className="bg-white border-2 border-amber-300 rounded-xl px-4 py-2.5 mb-3 text-center">
              <p className="text-xs text-slate-400 mb-0.5">Preview:</p>
              <p className="text-base font-black text-amber-600">{previewNomor}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nomor Urut" required error={errors.nomorUrut} hint="Contoh: 009"><input value={form.nomorUrut} onChange={e=>set('nomorUrut',e.target.value)} placeholder="009" className={ic('nomorUrut')}/></Field>
              <Field label="Cabang / Project" required error={errors.cabangManual} hint="Contoh: APLPKU"><input value={form.cabangManual} onChange={e=>set('cabangManual',e.target.value)} placeholder="APLPKU" className={ic('cabangManual')}/></Field>
            </div>
          </div>
        </Card>
      )}

      {step===1&&(
        <Card>
          <h2 className="text-sm font-bold text-slate-700 mb-4">Data Kendaraan & Keterangan</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pemohon"><input value={user?.name} disabled className={ic('')}/></Field>
              <Field label="Jabatan"><input value={user?.jabatan||'—'} disabled className={ic('')}/></Field>
            </div>
            <Field label="Kendaraan / Plat Nomor" required error={errors.kendaraan} hint="Riwayat KM otomatis muncul saat isi item di langkah berikutnya">
              <input value={form.kendaraan} onChange={e=>set('kendaraan',e.target.value)} placeholder="BM 1234 ZZ" className={ic('kendaraan')}/>
            </Field>
            <Field label="Jenis Pembelian" required error={errors.jenis_pembelian}>
              <input value={form.jenis_pembelian} onChange={e=>set('jenis_pembelian',e.target.value)} placeholder="Penggantian Ban" className={ic('jenis_pembelian')}/>
            </Field>
            <Field label="Alasan Pengajuan" required error={errors.alasan}>
              <textarea value={form.alasan} onChange={e=>set('alasan',e.target.value)} rows={3} placeholder="Jelaskan alasan pengajuan..."
                className={`w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none resize-none placeholder:text-slate-300 transition-colors leading-relaxed focus:ring-2 ${errors.alasan?'border-red-300 focus:border-red-400 focus:ring-red-50':'border-slate-200 focus:border-amber-400 focus:ring-amber-100'}`}/>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Batas Waktu Dana" required error={errors.batas_waktu_dana}><input value={form.batas_waktu_dana} onChange={e=>set('batas_waktu_dana',e.target.value)} placeholder="30 Hari" className={ic('batas_waktu_dana')}/></Field>
              <Field label="Batas Akhir Pembayaran" required error={errors.batas_akhir_pembayaran}><input type="date" value={form.batas_akhir_pembayaran} onChange={e=>set('batas_akhir_pembayaran',e.target.value)} className={ic('batas_akhir_pembayaran')}/></Field>
            </div>
          </div>
        </Card>
      )}

      {step===2&&(
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center"><span className="text-white text-[10px] font-black">1</span></div>
              <h2 className="text-sm font-bold text-slate-700">Vendor / Bengkel Pertama</h2>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nama Vendor *" error={errors.vendor}><input value={form.vendor} onChange={e=>set('vendor',e.target.value)} placeholder="Nama bengkel" className={ic('vendor')}/></Field>
                <Field label="NPWP (opsional)"><input value={form.npwp} onChange={e=>set('npwp',e.target.value)} placeholder="XX.XXX..." className={ic('')}/></Field>
              </div>
              <Field label="Rekening Tujuan Pembayaran" hint="Bank — Nomor a/n Nama">
                <textarea value={form.rekening_tujuan} onChange={e=>set('rekening_tujuan',e.target.value)} rows={2} placeholder="BCA — 1234567890 a/n Nama" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 outline-none resize-none placeholder:text-slate-300 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"/>
              </Field>
              <ItemsSection items={form.items1} total={total1} vendorNum={1} errors={errors}
                onUpdate={updateItem1} onAdd={addItem1} onRemove={removeItem1}
                onBlurPenjelasan={handleBlurPenjelasan1} itemKMCache={itemKMCache}/>
            </div>
          </Card>
          {form.kendaraan?.trim()&&<VehicleHistoryPanel kendaraan={form.kendaraan}/>}
        </div>
      )}

      {step===3&&(
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center"><span className="text-white text-[10px] font-black">2</span></div>
            <h2 className="text-sm font-bold text-slate-700">Vendor Pembanding <span className="text-slate-400 font-normal text-xs">(opsional)</span></h2>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-4">
            <button type="button" onClick={()=>set('useVendor2',!form.useVendor2)} className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.useVendor2?'bg-amber-500':'bg-slate-300'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${form.useVendor2?'translate-x-5':'translate-x-0'}`}/>
            </button>
            <p className="text-sm font-semibold text-slate-700">Tambahkan Vendor Pembanding</p>
          </div>
          {form.useVendor2&&(
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nama Vendor 2 *" error={errors.vendor2}><input value={form.vendor2} onChange={e=>set('vendor2',e.target.value)} placeholder="Nama bengkel 2" className={ic('vendor2')}/></Field>
                <Field label="NPWP (opsional)"><input value={form.npwp2} onChange={e=>set('npwp2',e.target.value)} placeholder="Opsional" className={ic('')}/></Field>
              </div>
              <ItemsSection items={form.items2} total={total2} vendorNum={2} errors={errors}
                onUpdate={updateItem2} onAdd={addItem2} onRemove={removeItem2}
                onBlurPenjelasan={handleBlurPenjelasan2} itemKMCache={itemKMCache}/>
            </div>
          )}
        </Card>
      )}

      {step===4&&(
        <Card>
          <h2 className="text-sm font-bold text-slate-700 mb-1">Lampiran Foto <span className="text-red-500">*</span></h2>
          <p className="text-xs text-slate-400 mb-4">Minimal 1 foto wajib dilampirkan.</p>
          <PhotoUploader photos={photos} onAdd={p=>{setPhotos(prev=>[...prev,p]);setErrors(e=>({...e,photos:''}));}} onRemove={id=>setPhotos(prev=>prev.filter(p=>p.id!==id))}/>
          {errors.photos&&<p className="flex items-center gap-1 text-xs text-red-500 mt-2"><AlertCircle size={10}/> {errors.photos}</p>}
        </Card>
      )}

      {step===5&&(
        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-bold text-slate-700 mb-3">Review & Konfirmasi</h2>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3"><p className="text-xs font-semibold text-amber-700">⚠ Periksa kembali semua data sebelum mengirim.</p></div>
            <div className="bg-slate-800 rounded-xl px-4 py-3 mb-3 text-center">
              <p className="text-[10px] text-slate-400 mb-1">Nomor Pengajuan</p>
              <p className="text-base font-black text-amber-400">{buildNomor(form.nomorUrut,form.type,form.cabangManual)}</p>
            </div>
            {[['Jenis',form.type],['Pemohon',user?.name],['Kendaraan',form.kendaraan],['Jenis Pembelian',form.jenis_pembelian],['Vendor 1',form.vendor],...(form.rekening_tujuan?[['Rekening',form.rekening_tujuan]]:[]),['Total Vendor 1',fmtCurrency(total1)],...(form.useVendor2?[['Vendor 2',form.vendor2],['Total Vendor 2',fmtCurrency(total2)]]:[]),['Batas Waktu',form.batas_waktu_dana],['Batas Bayar',form.batas_akhir_pembayaran],['Foto',`${photos.length} foto`]].map(([k,v],i,arr)=>(
              <div key={k} className={`flex justify-between gap-4 py-2 ${i<arr.length-1?'border-b border-slate-50':''}`}>
                <span className="text-xs text-slate-400">{k}</span><span className="text-xs font-bold text-slate-700 text-right">{v}</span>
              </div>
            ))}
          </Card>
          <Card>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Preview Riwayat KM:</p>
            <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200 font-mono">{buildRiwayat()}</div>
          </Card>
        </div>
      )}

      <div className="flex gap-3 pb-4">
        {step>0&&<Button variant="secondary" className="flex-1" onClick={handleBack}>← Kembali</Button>}
        {step<STEPS.length-1?<Button className="flex-1" onClick={handleNext}>Lanjut →</Button>:<Button variant="success" className="flex-1" onClick={submit} loading={loading}>✓ Kirim Pengajuan</Button>}
      </div>
    </div>
  );
}
