// src/pages/NewFormPage.jsx  — v10
// Perubahan:
// 1. Riwayat KM 4 field: tanggal terakhir (auto), km terakhir (auto), km sekarang (user), selisih (auto)
// 2. ItemsSection tetap di luar main component (anti focus-loss)
// 3. Total item = qty (satuan) × harga
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
  if (!km && km !== 0) return '—';
  return Number(km).toLocaleString('id-ID') + ' KM';
}

function fmtTanggal(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

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

// ── ItemRow & ItemsSection DI LUAR main component ──
function ItemRow({ item, idx, totalItems, vendorNum, onUpdate, onRemove, errors }) {
  const eb = `item${vendorNum}_${idx}`;
  const handlePenjelasan = useCallback(e => onUpdate(item.id, 'penjelasan', e.target.value), [item.id, onUpdate]);
  const handleSatuan     = useCallback(e => onUpdate(item.id, 'satuan',     e.target.value), [item.id, onUpdate]);
  const handleHarga      = useCallback(e => onUpdate(item.id, 'harga',      e.target.value), [item.id, onUpdate]);
  const itemTotal = calcItemTotal(item);
  return (
    <div className={`border rounded-xl p-3 space-y-2 ${errors[`${eb}_pen`]||errors[`${eb}_sat`]||errors[`${eb}_hrg`]?'border-red-300 bg-red-50':'border-slate-200 bg-white'}`}>
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold text-slate-400">ITEM {idx + 1}</span>
        {totalItems > 1 && <button type="button" onMouseDown={e=>e.preventDefault()} onClick={() => onRemove(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={13}/></button>}
      </div>
      <textarea value={item.penjelasan} onChange={handlePenjelasan} rows={2} placeholder="Penjelasan item..."
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
      {itemTotal > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">{parseFloat(item.satuan) > 1 && `${parseFloat(item.satuan)} × ${fmtCurrency(parseFloat(item.harga)||0)} =`}</span>
          <span className="text-amber-500 font-semibold">{fmtCurrency(itemTotal)}</span>
        </div>
      )}
    </div>
  );
}

function ItemsSection({ items, total, vendorNum, errors, onUpdate, onAdd, onRemove }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-600">Item / Rincian <span className="text-red-500">*</span></label>
        <button type="button" onMouseDown={e=>e.preventDefault()} onClick={onAdd} className="flex items-center gap-1 text-xs font-bold text-amber-500 hover:text-amber-600"><Plus size={13}/> Tambah Item</button>
      </div>
      {items.map((item, idx) => (
        <ItemRow key={item.id} item={item} idx={idx} totalItems={items.length} vendorNum={vendorNum} errors={errors} onUpdate={onUpdate} onRemove={onRemove}/>
      ))}
      <div className="flex justify-between items-center bg-amber-50 rounded-xl px-3 py-2.5">
        <span className="text-sm font-extrabold text-amber-800">TOTAL</span>
        <span className="text-base font-black text-amber-500">{fmtCurrency(total)}</span>
      </div>
    </div>
  );
}

// ── RiwayatKMSection DI LUAR main component ──
// Jika arsip ADA  → field a & b auto (read-only)
// Jika arsip KOSONG → field a & b bisa diisi manual oleh pemohon
function RiwayatKMSection({
  hasArsip, loadingKM,
  kmTerakhir, tanggalTerakhir, nomorTerakhir,
  kmManual, tglManual, onKmManualChange, onTglManualChange,
  kmSaatIni, onKMChange, error, errorKmTerakhir,
}) {
  // KM terakhir efektif: dari arsip jika ada, atau dari input manual
  const kmTerakhirVal = hasArsip ? kmTerakhir : (parseInt(kmManual) || null);
  const selisih = kmSaatIni && kmTerakhirVal != null
    ? (parseInt(kmSaatIni) || 0) - kmTerakhirVal : null;

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-slate-600">Riwayat KM Kendaraan <span className="text-red-500">*</span></label>

      {/* Info banner jika arsip kosong */}
      {!loadingKM && !hasArsip && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={13} className="text-amber-500 flex-shrink-0 mt-0.5"/>
          <p className="text-[11px] text-amber-700 leading-snug">
            Belum ada riwayat di arsip untuk kendaraan ini. Silakan isi <strong>tanggal & KM terakhir</strong> secara manual.
          </p>
        </div>
      )}

      <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
        {/* a. Tanggal terakhir */}
        <div className={`flex items-center border-b border-slate-100 px-3 py-2 gap-2 ${hasArsip ? 'bg-slate-50' : ''}`}>
          <span className="w-44 text-slate-500 flex-shrink-0">
            a. Tanggal Terakhir Pengajuan {!hasArsip && <span className="text-red-500">*</span>}
          </span>
          {loadingKM ? (
            <span className="flex-1"><Loader size={11} className="text-amber-400 animate-spin"/></span>
          ) : hasArsip ? (
            <>
              <span className="flex-1 font-semibold text-slate-700">
                {fmtTanggal(tanggalTerakhir)}{nomorTerakhir ? ` (${nomorTerakhir})` : ''}
              </span>
              <span className="bg-blue-100 text-blue-600 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">AUTO</span>
            </>
          ) : (
            <>
              <input type="date" value={tglManual} onChange={e => onTglManualChange(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"/>
              <span className="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">ISI</span>
            </>
          )}
        </div>

        {/* b. KM terakhir */}
        <div className={`flex items-center border-b border-slate-100 px-3 py-2 gap-2 ${hasArsip ? 'bg-slate-50' : ''}`}>
          <span className="w-44 text-slate-500 flex-shrink-0">
            b. KM Terakhir Pengajuan {!hasArsip && <span className="text-red-500">*</span>}
          </span>
          {loadingKM ? (
            <span className="flex-1"><Loader size={11} className="text-amber-400 animate-spin"/></span>
          ) : hasArsip ? (
            <>
              <span className="flex-1 font-semibold text-slate-700">{fmtKM(kmTerakhir)}</span>
              <span className="bg-blue-100 text-blue-600 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">AUTO</span>
            </>
          ) : (
            <>
              <input type="number" value={kmManual} onChange={e => onKmManualChange(e.target.value)} placeholder="Contoh: 15000"
                className={`flex-1 px-3 py-1.5 rounded-lg border text-slate-800 outline-none focus:ring-2 focus:ring-amber-100 placeholder:text-slate-300 ${errorKmTerakhir?'border-red-300':'border-slate-200 focus:border-amber-400'}`}/>
              <span className="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">ISI</span>
            </>
          )}
        </div>

        {/* c. KM saat pengajuan */}
        <div className="flex items-center border-b border-slate-100 px-3 py-2 gap-2">
          <span className="w-44 text-slate-500 flex-shrink-0">c. KM Saat Pengajuan <span className="text-red-500">*</span></span>
          <input type="number" value={kmSaatIni} onChange={e => onKMChange(e.target.value)} placeholder="Contoh: 16500"
            className={`flex-1 px-3 py-1.5 rounded-lg border text-slate-800 outline-none focus:ring-2 focus:ring-amber-100 placeholder:text-slate-300 ${error?'border-red-300':'border-slate-200 focus:border-amber-400'}`}/>
          <span className="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">ISI</span>
        </div>

        {/* d. Selisih */}
        <div className="flex items-center px-3 py-2.5 bg-slate-50 gap-2">
          <span className="w-44 text-slate-500 flex-shrink-0">d. Selisih KM</span>
          <span className={`flex-1 font-bold ${selisih != null ? selisih >= 0 ? 'text-emerald-600' : 'text-red-500' : 'text-slate-400 italic'}`}>
            {selisih != null ? `${selisih >= 0 ? '+' : ''}${selisih.toLocaleString('id-ID')} KM` : '—'}
          </span>
          <span className="bg-blue-100 text-blue-600 rounded px-1.5 py-0.5 font-bold text-[9px] flex-shrink-0">AUTO</span>
        </div>
      </div>
      {(error || errorKmTerakhir) && <p className="flex items-center gap-1 text-xs text-red-500"><AlertCircle size={10}/> {error || errorKmTerakhir}</p>}
    </div>
  );
}

const newItem = () => ({ id: crypto.randomUUID(), penjelasan: '', satuan: '', harga: '' });

export default function NewFormPage() {
  const { user }  = useAuthStore();
  const navigate  = useNavigate();
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos]   = useState([]);
  const [errors, setErrors]   = useState({});
  const [kmTerakhir, setKmTerakhir]           = useState(null);
  const [tanggalTerakhir, setTanggalTerakhir] = useState(null);
  const [nomorTerakhir, setNomorTerakhir]     = useState(null);
  const [kmSaatIni, setKmSaatIni]             = useState('');
  const [loadingKM, setLoadingKM]             = useState(false);
  const [hasArsip, setHasArsip]               = useState(false);   // ada riwayat di arsip?
  const [kmManual, setKmManual]               = useState('');       // KM terakhir manual (jika arsip kosong)
  const [tglManual, setTglManual]             = useState('');       // tanggal terakhir manual

  const [form, setForm] = useState({
    type:'PR', nomorUrut:'', cabangManual: user?.cabang||'',
    kendaraan:'', jenis_pembelian:'',
    vendor:'', npwp:'', rekening_tujuan:'',
    items1:[newItem()],
    useVendor2:false, vendor2:'', npwp2:'', items2:[newItem()],
    alasan:'', batas_waktu_dana:'', batas_akhir_pembayaran:'',
  });

  const set = useCallback((k, v) => { setForm(f=>({...f,[k]:v})); setErrors(e=>({...e,[k]:''})); }, []);

  const fetchLastKM = useCallback(async (plat, keyword = '') => {
    if (!plat?.trim()) return;
    setLoadingKM(true);
    try {
      const { data: res } = await historyAPI.getLastKM(plat.trim(), keyword);
      if (res?.data) {
        setKmTerakhir(res.data.km_pengajuan);
        setTanggalTerakhir(res.data.tanggal);
        setNomorTerakhir(res.data.nomor_pengajuan);
        setHasArsip(true);          // arsip ADA → field a & b auto
      } else {
        setKmTerakhir(null); setTanggalTerakhir(null); setNomorTerakhir(null);
        setHasArsip(false);         // arsip KOSONG → field a & b manual
      }
    } catch {
      setHasArsip(false);
    }
    setLoadingKM(false);
  }, []);

  useEffect(() => {
    if (step === 2 && form.kendaraan?.trim()) {
      // Fetch KM terakhir berdasarkan plat + keyword dari item yang diisi
      const keyword = form.items1.map(i => i.penjelasan).filter(Boolean).join(' ');
      fetchLastKM(form.kendaraan, keyword);
    }
  }, [step]); // eslint-disable-line

  const updateItem1 = useCallback((id,f,v)=>setForm(s=>({...s,items1:s.items1.map(it=>it.id===id?{...it,[f]:v}:it)})),[]);
  const updateItem2 = useCallback((id,f,v)=>setForm(s=>({...s,items2:s.items2.map(it=>it.id===id?{...it,[f]:v}:it)})),[]);
  const addItem1    = useCallback(()=>setForm(s=>({...s,items1:[...s.items1,newItem()]})),[]);
  const addItem2    = useCallback(()=>setForm(s=>({...s,items2:[...s.items2,newItem()]})),[]);
  const removeItem1 = useCallback((id)=>setForm(s=>({...s,items1:s.items1.filter(it=>it.id!==id)})),[]);
  const removeItem2 = useCallback((id)=>setForm(s=>({...s,items2:s.items2.filter(it=>it.id!==id)})),[]);

  const total1 = form.items1.reduce((s,i)=>s+calcItemTotal(i),0);
  const total2 = form.items2.reduce((s,i)=>s+calcItemTotal(i),0);
  const previewNomor = buildNomor(form.nomorUrut||'###', form.type, form.cabangManual||'CABANG');

  const buildRiwayat = () => {
    const kmInt        = parseInt(kmSaatIni) || 0;
    // Nilai efektif: arsip jika ada, manual jika kosong
    const kmTerakhirEf = hasArsip ? kmTerakhir : (parseInt(kmManual) || null);
    const tglTerakhirEf = hasArsip ? tanggalTerakhir : (tglManual || null);
    const selisih      = kmTerakhirEf != null ? kmInt - kmTerakhirEf : null;
    const sumberLabel  = hasArsip ? (nomorTerakhir ? ` (${nomorTerakhir})` : '') : ' (input manual)';
    return [
      `a. Tanggal Terakhir Pengajuan : ${tglTerakhirEf ? fmtTanggal(tglTerakhirEf) : 'Belum ada riwayat'}${tglTerakhirEf ? sumberLabel : ''}`,
      `b. KM Terakhir Pengajuan      : ${kmTerakhirEf != null ? fmtKM(kmTerakhirEf) : '—'}`,
      `c. KM Saat Pengajuan          : ${kmSaatIni ? fmtKM(kmInt) : '—'}`,
      `d. Selisih KM                 : ${selisih != null ? `${selisih >= 0 ? '+' : ''}${selisih.toLocaleString('id-ID')} KM` : '—'}`,
    ].join('\n');
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
      // Validasi KM (dipindah ke step 2 karena KM diisi setelah item)
      if (!kmSaatIni || parseInt(kmSaatIni) <= 0) e.km_pengajuan = 'KM saat pengajuan wajib diisi';
      if (!hasArsip && !loadingKM) {
        if (!kmManual || parseInt(kmManual) <= 0) e.km_terakhir = 'KM terakhir wajib diisi (arsip kosong)';
        if (!tglManual) e.km_terakhir = 'Tanggal & KM terakhir wajib diisi (arsip kosong)';
      }
      form.items1.forEach((it,i) => {
        if (!it.penjelasan.trim()) e[`item1_${i}_pen`]='Wajib';
        if (!it.satuan.trim())     e[`item1_${i}_sat`]='Wajib';
        if (!it.harga||parseFloat(it.harga)<=0) e[`item1_${i}_hrg`]='Wajib';
      });
    }
    if (s===3&&form.useVendor2) {
      if (!form.vendor2.trim()) e.vendor2='Wajib';
      form.items2.forEach((it,i) => {
        if (!it.penjelasan.trim()) e[`item2_${i}_pen`]='Wajib';
        if (!it.satuan.trim())     e[`item2_${i}_sat`]='Wajib';
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
        ...form.items1.map(i=>({penjelasan:i.penjelasan,satuan:i.satuan,vendor_num:1,harga:parseFloat(i.harga)||0,total:calcItemTotal(i)})),
        ...(form.useVendor2?form.items2.map(i=>({penjelasan:i.penjelasan,satuan:i.satuan,vendor_num:2,harga:parseFloat(i.harga)||0,total:calcItemTotal(i)})):[]),
      ];
      const payload = {
        nomor_pengajuan:nomor, nomor_urut:form.nomorUrut, cabang_manual:form.cabangManual,
        type:form.type, kendaraan:form.kendaraan, jenis_pembelian:form.jenis_pembelian,
        vendor:form.vendor, npwp:form.npwp, rekening_tujuan:form.rekening_tujuan,
        vendor2:form.useVendor2?form.vendor2:'', npwp2:form.useVendor2?form.npwp2:'',
        alasan:form.alasan, riwayat, km_pengajuan:parseInt(kmSaatIni)||null,
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
            <Field label="Kendaraan / Plat Nomor" required error={errors.kendaraan}>
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
                <Field label="NPWP/KTP (opsional)"><input value={form.npwp} onChange={e=>set('npwp',e.target.value)} placeholder="XX.XXX..." className={ic('')}/></Field>
              </div>
              <Field label="Rekening Tujuan Pembayaran" hint="Bank — Nomor a/n Nama">
                <textarea value={form.rekening_tujuan} onChange={e=>set('rekening_tujuan',e.target.value)} rows={2} placeholder="BCA — 1234567890 a/n Nama" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 outline-none resize-none placeholder:text-slate-300 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"/>
              </Field>
              <ItemsSection items={form.items1} total={total1} vendorNum={1} errors={errors} onUpdate={updateItem1} onAdd={addItem1} onRemove={removeItem1}/>

              {/* Riwayat KM — muncul setelah item diisi, berdasarkan plat + item */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-400 italic">
                    KM diambil dari arsip plat <strong>{form.kendaraan}</strong> + item yang diisi
                  </span>
                  <button type="button"
                    onClick={() => { const kw = form.items1.map(i=>i.penjelasan).filter(Boolean).join(' '); fetchLastKM(form.kendaraan, kw); }}
                    className="text-[10px] text-amber-500 hover:text-amber-600 font-semibold flex items-center gap-1">
                    ↻ Refresh KM
                  </button>
                </div>
                <RiwayatKMSection
                  hasArsip={hasArsip} loadingKM={loadingKM}
                  kmTerakhir={kmTerakhir} tanggalTerakhir={tanggalTerakhir} nomorTerakhir={nomorTerakhir}
                  kmManual={kmManual} tglManual={tglManual}
                  onKmManualChange={v=>{setKmManual(v);setErrors(e=>({...e,km_terakhir:''}));}}
                  onTglManualChange={v=>{setTglManual(v);setErrors(e=>({...e,km_terakhir:''}));}}
                  kmSaatIni={kmSaatIni}
                  onKMChange={v=>{setKmSaatIni(v);setErrors(e=>({...e,km_pengajuan:''}));}}
                  error={errors.km_pengajuan} errorKmTerakhir={errors.km_terakhir}
                />
              </div>
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
                <Field label="NPWP/KTP (opsional)"><input value={form.npwp2} onChange={e=>set('npwp2',e.target.value)} placeholder="Opsional" className={ic('')}/></Field>
              </div>
              <ItemsSection items={form.items2} total={total2} vendorNum={2} errors={errors} onUpdate={updateItem2} onAdd={addItem2} onRemove={removeItem2}/>
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
            {[['Jenis',form.type],['Pemohon',user?.name],['Kendaraan',form.kendaraan],['Jenis Pembelian',form.jenis_pembelian],['Vendor 1',form.vendor],...(form.rekening_tujuan?[['Rekening',form.rekening_tujuan]]:[]),['Total Vendor 1',fmtCurrency(total1)],...(form.useVendor2?[['Vendor 2',form.vendor2],['Total Vendor 2',fmtCurrency(total2)]]:[]),['KM Saat Ini',kmSaatIni?fmtKM(parseInt(kmSaatIni)):'—'],['Batas Waktu',form.batas_waktu_dana],['Batas Bayar',form.batas_akhir_pembayaran],['Foto',`${photos.length} foto`]].map(([k,v],i,arr)=>(
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
