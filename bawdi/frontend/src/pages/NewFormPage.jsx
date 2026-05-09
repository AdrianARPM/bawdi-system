// src/pages/NewFormPage.jsx  — v6
// Perubahan: manual nomor urut, format nomor baru, item form diperbaiki
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Check, ChevronLeft, Upload, X, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { submissionAPI, photoAPI, offlineQueue } from '../utils/api';
import { Card, Button, fmtCurrency } from '../components/ui';
import VehicleHistoryPanel from '../components/VehicleHistoryPanel';
import useAuthStore from '../context/authStore';

const STEPS = ['Jenis', 'Pemohon', 'Vendor 1', 'Vendor 2', 'Foto', 'Review'];
const MONTHS_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];

// ── Format nomor pengajuan ─────────────────────────────────────────
function buildNomor(nomorUrut, type, cabangManual) {
  const now   = new Date();
  const bulan = String(now.getMonth() + 1).padStart(2, '0');
  const tahun = String(now.getFullYear()).slice(-2);
  const cab   = (cabangManual || '').replace(/\s+/g, '').toUpperCase();
  return `${nomorUrut}-${type}/BKD-${cab}/${bulan}${tahun}`;
}

// ── Foto uploader ──────────────────────────────────────────────────
function PhotoUploader({ photos, onAdd, onRemove }) {
  const ref = useRef();
  const handleFile = e => {
    Array.from(e.target.files).forEach(file => {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} maks 10MB`); return; }
      const r = new FileReader();
      r.onload = ev => onAdd({ id: Date.now() + Math.random(), name: file.name, type: file.type, data: ev.target.result, size: file.size });
      r.readAsDataURL(file);
    });
    e.target.value = '';
  };
  return (
    <div>
      <input ref={ref} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={handleFile} />
      <button type="button" onClick={() => ref.current?.click()}
        className="w-full border-2 border-dashed border-slate-300 hover:border-amber-400 rounded-2xl p-6 flex flex-col items-center gap-2 transition-colors">
        <Upload size={20} className="text-amber-400" />
        <p className="text-sm font-semibold text-slate-600">Klik untuk upload foto / PDF</p>
        <p className="text-xs text-slate-400">JPG, PNG, PDF • Maks 10MB per file</p>
      </button>
      {photos.length > 0 && (
        <div className="mt-3 space-y-2">
          {photos.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              {p.type?.startsWith('image/')
                ? <img src={p.data} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" alt={p.name} />
                : <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0 text-xs font-bold text-red-400">PDF</div>
              }
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{p.name}</p>
                <p className="text-[10px] text-slate-400">{(p.size/1024).toFixed(0)} KB</p>
              </div>
              <button type="button" onClick={() => onRemove(p.id)} className="text-red-400 hover:text-red-600"><X size={15}/></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Field wrapper dengan error ─────────────────────────────────────
function Field({ label, required, error, hint, children }) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-bold text-slate-600 mb-1.5">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint  && !error && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
      {error && <p className="flex items-center gap-1 text-xs text-red-500 mt-1"><AlertCircle size={10}/> {error}</p>}
    </div>
  );
}

// ── Item row — fixed: bisa ketik tanpa klik per kata ───────────────
function ItemRow({ item, idx, totalItems, onChange, onRemove, vendorNum, errors }) {
  const errBase = `item${vendorNum}_${idx}`;
  return (
    <div className={`border rounded-xl p-3 space-y-2 ${
      errors[`${errBase}_pen`] || errors[`${errBase}_sat`] || errors[`${errBase}_hrg`]
        ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'
    }`}>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-bold text-slate-400">ITEM {idx + 1}</span>
        {totalItems > 1 && (
          <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600">
            <Trash2 size={12}/>
          </button>
        )}
      </div>

      {/* Penjelasan — autoResize textarea agar terasa seperti input biasa */}
      <Field error={errors[`${errBase}_pen`]}>
        <textarea
          value={item.penjelasan}
          onChange={e => onChange('penjelasan', e.target.value)}
          onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
          rows={1}
          placeholder="Penjelasan item: nama barang, merek, ukuran, kondisi..."
          className={`w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none resize-none overflow-hidden transition-all placeholder:text-slate-300 leading-relaxed ${
            errors[`${errBase}_pen`]
              ? 'border-red-300 bg-red-50 focus:border-red-400'
              : 'border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
          }`}
          style={{ minHeight: '40px' }}
        />
      </Field>

      {/* Satuan dan Harga dalam satu baris */}
      <div className="grid grid-cols-5 gap-2">
        <div className="col-span-2">
          <Field error={errors[`${errBase}_sat`]}>
            <input
              value={item.satuan}
              onChange={e => onChange('satuan', e.target.value)}
              placeholder="Satuan"
              className={`w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none transition-all placeholder:text-slate-300 ${
                errors[`${errBase}_sat`] ? 'border-red-300 bg-red-50' : 'border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
              }`}
            />
          </Field>
        </div>
        <div className="col-span-3">
          <Field error={errors[`${errBase}_hrg`]}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">Rp</span>
              <input
                type="number"
                value={item.harga}
                onChange={e => onChange('harga', e.target.value)}
                placeholder="0"
                className={`w-full pl-8 pr-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none transition-all placeholder:text-slate-300 ${
                  errors[`${errBase}_hrg`] ? 'border-red-300 bg-red-50' : 'border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
                }`}
              />
            </div>
          </Field>
        </div>
      </div>

      {item.harga > 0 && (
        <p className="text-xs text-amber-500 font-semibold text-right">{fmtCurrency(parseFloat(item.harga)||0)}</p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function NewFormPage() {
  const { user }  = useAuthStore();
  const navigate  = useNavigate();
  const [step,    setStep]    = useState(0);
  const [loading, setLoading] = useState(false);
  const [photos,  setPhotos]  = useState([]);
  const [errors,  setErrors]  = useState({});

  const now   = new Date();
  const bulan = String(now.getMonth()+1).padStart(2,'0');
  const tahun = String(now.getFullYear()).slice(-2);

  const [form, setForm] = useState({
    type: 'PR',
    nomorUrut:    '',       // manual
    cabangManual: user?.cabang || '',  // manual, pre-fill dari user
    kendaraan:    '', jenis_pembelian: '',
    vendor:  '', npwp: '',  rekening_tujuan: '',
    items1:  [{ id: 1, penjelasan: '', satuan: '', harga: '' }],
    useVendor2: false,
    vendor2: '', npwp2: '',
    items2:  [{ id: 1, penjelasan: '', satuan: '', harga: '' }],
    alasan:  '', riwayat:  '',
    batas_waktu_dana: '', batas_akhir_pembayaran: '',
  });

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  const total1 = form.items1.reduce((s,i) => s + (parseFloat(i.harga)||0), 0);
  const total2 = form.items2.reduce((s,i) => s + (parseFloat(i.harga)||0), 0);

  const updateItem = (listKey, idx, field, value) => {
    const list = form[listKey].map((it,i) => i===idx ? { ...it, [field]: value } : it);
    set(listKey, list);
  };
  const addItem    = k => set(k, [...form[k], { id: Date.now(), penjelasan:'', satuan:'', harga:'' }]);
  const removeItem = (k, idx) => set(k, form[k].filter((_,i) => i!==idx));

  // Preview nomor pengajuan
  const previewNomor = buildNomor(form.nomorUrut || '###', form.type, form.cabangManual || 'CABANG');

  const historyKeyword = form.items1.map(i=>i.penjelasan).filter(Boolean).join(' ').substring(0,50);

  /* ── Validasi ─────────────────────────────────────────────────── */
  const validate = s => {
    const e = {};
    if (s === 0) {
      if (!form.nomorUrut.trim())    e.nomorUrut    = 'Nomor urut wajib diisi';
      if (!form.cabangManual.trim()) e.cabangManual = 'Cabang/Project wajib diisi';
    }
    if (s === 1) {
      if (!form.kendaraan.trim())       e.kendaraan       = 'Plat kendaraan wajib diisi';
      if (!form.jenis_pembelian.trim()) e.jenis_pembelian = 'Jenis pembelian wajib diisi';
      if (!form.alasan.trim())          e.alasan          = 'Alasan wajib diisi';
      if (!form.riwayat.trim())         e.riwayat         = 'Riwayat wajib diisi';
      if (!form.batas_waktu_dana.trim())e.batas_waktu_dana= 'Batas waktu dana wajib diisi';
      if (!form.batas_akhir_pembayaran) e.batas_akhir_pembayaran = 'Batas akhir bayar wajib diisi';
    }
    if (s === 2) {
      if (!form.vendor.trim()) e.vendor = 'Nama vendor wajib diisi';
      form.items1.forEach((item,i) => {
        if (!item.penjelasan.trim()) e[`item1_${i}_pen`] = 'Wajib';
        if (!item.satuan.trim())     e[`item1_${i}_sat`] = 'Wajib';
        if (!item.harga || parseFloat(item.harga)<=0) e[`item1_${i}_hrg`] = 'Wajib';
      });
    }
    if (s === 3 && form.useVendor2) {
      if (!form.vendor2.trim()) e.vendor2 = 'Nama vendor 2 wajib diisi';
      form.items2.forEach((item,i) => {
        if (!item.penjelasan.trim()) e[`item2_${i}_pen`] = 'Wajib';
        if (!item.satuan.trim())     e[`item2_${i}_sat`] = 'Wajib';
        if (!item.harga || parseFloat(item.harga)<=0) e[`item2_${i}_hrg`] = 'Wajib';
      });
    }
    if (s === 4 && photos.length === 0) e.photos = 'Minimal 1 foto wajib dilampirkan';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (!validate(step)) { toast.error('Lengkapi semua field yang wajib diisi'); return; }
    if (step === 3 && !form.useVendor2) { setStep(4); return; }
    setStep(s => s+1);
  };
  const handleBack = () => {
    setErrors({});
    if (step === 4 && !form.useVendor2) { setStep(2); return; }
    setStep(s => s-1);
  };

  /* ── Submit ───────────────────────────────────────────────────── */
  const submit = async () => {
    if (!validate(step)) { toast.error('Lengkapi semua field yang wajib diisi'); return; }
    setLoading(true);
    try {
      const nomor_pengajuan = buildNomor(form.nomorUrut, form.type, form.cabangManual);
      const items = [
        ...form.items1.map(i => ({ ...i, vendor_num:1, harga: parseFloat(i.harga)||0 })),
        ...(form.useVendor2 ? form.items2.map(i => ({ ...i, vendor_num:2, harga: parseFloat(i.harga)||0 })) : []),
      ];
      const payload = {
        nomor_pengajuan,         // kirim nomor yang sudah diformat
        nomor_urut: form.nomorUrut,
        cabang_manual: form.cabangManual,
        type: form.type, kendaraan: form.kendaraan, jenis_pembelian: form.jenis_pembelian,
        vendor: form.vendor, npwp: form.npwp, rekening_tujuan: form.rekening_tujuan,
        vendor2: form.useVendor2 ? form.vendor2 : '', npwp2: form.useVendor2 ? form.npwp2 : '',
        alasan: form.alasan, riwayat: form.riwayat,
        batas_waktu_dana: form.batas_waktu_dana, batas_akhir_pembayaran: form.batas_akhir_pembayaran,
        items,
      };

      if (navigator.onLine) {
        const { data } = await submissionAPI.create(payload);
        if (photos.length > 0) {
          toast.loading('Mengupload foto...', { id: 'upload' });
          for (const p of photos) {
            try { await photoAPI.upload(data.id, { fileName: p.name, fileData: p.data, fileType: p.type }); }
            catch { toast.error(`Gagal upload: ${p.name}`); }
          }
          toast.dismiss('upload');
        }
        toast.success('Pengajuan berhasil dikirim!');
        navigate(`/submissions/${data.id}`);
      } else {
        offlineQueue.add(payload);
        toast.success('Tersimpan offline. Akan dikirim saat koneksi kembali.', { duration: 5000 });
        navigate('/submissions');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal mengirim pengajuan');
    }
    setLoading(false);
  };

  /* ── UI helpers ───────────────────────────────────────────────── */
  const inputCls = (errKey) =>
    `w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none transition-all placeholder:text-slate-300 disabled:bg-slate-50 disabled:text-slate-400 ${
      errors[errKey]
        ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-50'
        : 'border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
    }`;

  const ItemsSection = ({ listKey, total, vendorNum }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-600">
          Item / Rincian Pekerjaan <span className="text-red-500">*</span>
        </label>
        <button type="button" onClick={() => addItem(listKey)}
          className="flex items-center gap-1 text-xs font-bold text-amber-500 hover:text-amber-600 transition-colors">
          <Plus size={13}/> Tambah Item
        </button>
      </div>
      {form[listKey].map((item, idx) => (
        <ItemRow
          key={item.id}
          item={item} idx={idx}
          totalItems={form[listKey].length}
          vendorNum={vendorNum}
          errors={errors}
          onChange={(field, val) => updateItem(listKey, idx, field, val)}
          onRemove={() => removeItem(listKey, idx)}
        />
      ))}
      <div className="flex justify-between items-center bg-amber-50 rounded-xl px-3 py-2.5">
        <span className="text-sm font-extrabold text-amber-800">TOTAL</span>
        <span className="text-base font-black text-amber-500">{fmtCurrency(total)}</span>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50">
          <ChevronLeft size={18} className="text-slate-600"/>
        </button>
        <div>
          <h1 className="text-xl font-black text-slate-800">Buat Pengajuan Baru</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Langkah {step+1}/{STEPS.length} — Field <span className="text-red-500 font-bold">*</span> wajib diisi
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center overflow-x-auto pb-1 scrollbar-hide">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                i<step?'bg-emerald-500 text-white':i===step?'bg-amber-500 text-white':'bg-slate-200 text-slate-400'
              }`}>
                {i<step ? <Check size={12}/> : i+1}
              </div>
              <span className={`text-[9px] mt-1 font-medium whitespace-nowrap ${i===step?'text-amber-500':'text-slate-400'}`}>{s}</span>
            </div>
            {i<STEPS.length-1 && <div className={`w-5 h-0.5 mx-1 mb-3 flex-shrink-0 ${i<step?'bg-emerald-400':'bg-slate-200'}`}/>}
          </div>
        ))}
      </div>

      {/* ── STEP 0: Jenis + Nomor ─────────────────────────────── */}
      {step===0 && (
        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-bold text-slate-700 mb-4">Pilih Jenis Pengajuan</h2>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {[['PR','Purchase Requisition','Permintaan pembelian rutin'],
                ['PAR','Purchase Auth. Request','Otorisasi pembelian nilai besar']].map(([t,title,desc]) => (
                <button key={t} type="button" onClick={() => set('type', t)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${form.type===t?'border-amber-500 bg-amber-50':'border-slate-200 hover:border-slate-300'}`}>
                  <p className={`text-2xl font-black mb-1 ${form.type===t?'text-amber-500':'text-slate-300'}`}>{t}</p>
                  <p className="text-xs font-bold text-slate-700 mb-0.5">{title}</p>
                  <p className="text-[10px] text-slate-400">{desc}</p>
                </button>
              ))}
            </div>

            {/* Format Nomor Pengajuan */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
              <p className="text-xs font-bold text-slate-700 mb-3">Format Nomor Pengajuan</p>

              {/* Preview */}
              <div className="bg-white border-2 border-amber-300 rounded-xl px-4 py-2.5 mb-3 text-center">
                <p className="text-xs text-slate-400 mb-0.5">Preview Nomor:</p>
                <p className="text-base font-black text-amber-600 tracking-wide">{previewNomor}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Nomor Urut" required error={errors.nomorUrut}
                  hint="Contoh: 070, 071, 072">
                  <input value={form.nomorUrut} onChange={e => set('nomorUrut', e.target.value)}
                    placeholder="070" className={inputCls('nomorUrut')}/>
                </Field>
                <Field label="Cabang / Project" required error={errors.cabangManual}
                  hint="Contoh: APLBDO, JAKSEL">
                  <input value={form.cabangManual} onChange={e => set('cabangManual', e.target.value)}
                    placeholder="APLBDO" className={inputCls('cabangManual')}/>
                </Field>
              </div>

              <p className="text-[10px] text-slate-400 mt-2 text-center">
                Bulan/Tahun (<strong>{bulan}{tahun}</strong>) dan tipe (<strong>{form.type}</strong>) diisi otomatis
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* ── STEP 1: Pemohon + Keterangan ──────────────────────── */}
      {step===1 && (
        <Card>
          <h2 className="text-sm font-bold text-slate-700 mb-4">Data Kendaraan & Keterangan</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nama Pemohon">
                <input value={user?.name} disabled className={inputCls('')}/>
              </Field>
              <Field label="Jabatan">
                <input value={user?.jabatan} disabled className={inputCls('')}/>
              </Field>
            </div>
            <Field label="Kendaraan / Plat Nomor" required error={errors.kendaraan}>
              <input value={form.kendaraan} onChange={e => set('kendaraan', e.target.value)}
                placeholder="Contoh: BM 1234 ZZ" className={inputCls('kendaraan')}/>
            </Field>
            <Field label="Jenis Pembelian" required error={errors.jenis_pembelian}>
              <input value={form.jenis_pembelian} onChange={e => set('jenis_pembelian', e.target.value)}
                placeholder="Contoh: Penggantian Ban, Service Berkala" className={inputCls('jenis_pembelian')}/>
            </Field>
            <Field label="Alasan Pengajuan" required error={errors.alasan}>
              <textarea value={form.alasan} onChange={e => set('alasan', e.target.value)} rows={3}
                placeholder="Jelaskan alasan pengajuan secara rinci..."
                className={`w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none resize-none placeholder:text-slate-300 leading-relaxed transition-all ${
                  errors.alasan?'border-red-300 bg-red-50':'border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
                }`}/>
            </Field>
            <Field label="Riwayat Service / Penggantian Sebelumnya" required error={errors.riwayat}
              hint="💡 Tekan Enter untuk baris baru / paragraph baru">
              <textarea value={form.riwayat} onChange={e => set('riwayat', e.target.value)} rows={5}
                placeholder={`Contoh:\n15 Jan 2025 — Ganti oli, biaya Rp 150.000\n3 Mar 2025 — Service rutin, biaya Rp 300.000`}
                className={`w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none resize-none placeholder:text-slate-300 leading-relaxed transition-all ${
                  errors.riwayat?'border-red-300 bg-red-50':'border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
                }`}/>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Batas Waktu Dana" required error={errors.batas_waktu_dana}>
                <input value={form.batas_waktu_dana} onChange={e => set('batas_waktu_dana', e.target.value)}
                  placeholder="Contoh: 3 Hari" className={inputCls('batas_waktu_dana')}/>
              </Field>
              <Field label="Batas Akhir Pembayaran" required error={errors.batas_akhir_pembayaran}>
                <input type="date" value={form.batas_akhir_pembayaran}
                  onChange={e => set('batas_akhir_pembayaran', e.target.value)} className={inputCls('batas_akhir_pembayaran')}/>
              </Field>
            </div>
          </div>
        </Card>
      )}

      {/* ── STEP 2: Vendor 1 ──────────────────────────────────── */}
      {step===2 && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[10px] font-black">1</span>
              </div>
              <h2 className="text-sm font-bold text-slate-700">Vendor / Bengkel Pertama</h2>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nama Vendor / Bengkel" required error={errors.vendor}>
                  <input value={form.vendor} onChange={e => set('vendor', e.target.value)}
                    placeholder="Nama bengkel/vendor" className={inputCls('vendor')}/>
                </Field>
                <Field label="No. NPWP/KTP (opsional)">
                  <input value={form.npwp} onChange={e => set('npwp', e.target.value)}
                    placeholder="XX.XXX.XXX..." className={inputCls('')}/>
                </Field>
              </div>
              <Field label="Rekening Tujuan Pembayaran" hint="Contoh: BRI - 550001015614536 a/n Husni Ananda">
                <textarea value={form.rekening_tujuan} onChange={e => set('rekening_tujuan', e.target.value)}
                  rows={2} placeholder="Bank — Nomor Rekening a/n Nama Pemilik"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 outline-none resize-none placeholder:text-slate-300 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"/>
              </Field>
              <ItemsSection listKey="items1" total={total1} vendorNum={1}/>
            </div>
          </Card>

          {/* Panel riwayat kendaraan otomatis */}
          {form.kendaraan?.trim() && (
            <VehicleHistoryPanel kendaraan={form.kendaraan} keyword={historyKeyword}/>
          )}
        </div>
      )}

      {/* ── STEP 3: Vendor 2 (opsional) ───────────────────────── */}
      {step===3 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[10px] font-black">2</span>
            </div>
            <h2 className="text-sm font-bold text-slate-700">
              Vendor Pembanding <span className="text-slate-400 font-normal text-xs">(opsional)</span>
            </h2>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-4">
            <button type="button" onClick={() => { set('useVendor2', !form.useVendor2); }}
              className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.useVendor2?'bg-amber-500':'bg-slate-300'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${form.useVendor2?'translate-x-5':'translate-x-0'}`}/>
            </button>
            <p className="text-sm font-semibold text-slate-700">Tambahkan Vendor Pembanding</p>
          </div>

          {form.useVendor2 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nama Vendor / Bengkel 2" required error={errors.vendor2}>
                  <input value={form.vendor2} onChange={e => set('vendor2', e.target.value)}
                    placeholder="Nama bengkel/vendor" className={inputCls('vendor2')}/>
                </Field>
                <Field label="No. NPWP/KTP (opsional)">
                  <input value={form.npwp2} onChange={e => set('npwp2', e.target.value)}
                    placeholder="Opsional" className={inputCls('')}/>
                </Field>
              </div>
              <ItemsSection listKey="items2" total={total2} vendorNum={2}/>

              {total1>0 && total2>0 && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-500 mb-2 uppercase">Perbandingan Harga</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[['Vendor 1',total1,'blue'],['Vendor 2',total2,'orange']].map(([label,tot,color]) => (
                      <div key={label} className={`p-2.5 rounded-xl text-center border-2 ${
                        tot<==[total1,total2].find(t=>t!==tot)?'border-emerald-400 bg-emerald-50':'border-slate-200'
                      }`}>
                        <p className="text-[10px] text-slate-500 mb-1">{label}</p>
                        <p className={`text-sm font-black ${color==='blue'?'text-blue-600':'text-orange-500'}`}>{fmtCurrency(tot)}</p>
                        {tot<==[total1,total2].find(t=>t!==tot) && <p className="text-[9px] text-emerald-500 font-bold">✓ Lebih hemat</p>}
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 text-center mt-1.5">Selisih: {fmtCurrency(Math.abs(total1-total2))}</p>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ── STEP 4: Foto ──────────────────────────────────────── */}
      {step===4 && (
        <Card>
          <h2 className="text-sm font-bold text-slate-700 mb-1">
            Lampiran Foto <span className="text-red-500">*</span>
          </h2>
          <p className="text-xs text-slate-400 mb-4">Foto kondisi kendaraan/kerusakan. Minimal 1 foto wajib.</p>
          <PhotoUploader photos={photos}
            onAdd={p => { setPhotos(prev => [...prev, p]); setErrors(e => ({...e, photos:''})); }}
            onRemove={id => setPhotos(prev => prev.filter(p => p.id!==id))}/>
          {errors.photos && (
            <p className="flex items-center gap-1 text-xs text-red-500 mt-2 font-medium">
              <AlertCircle size={11}/> {errors.photos}
            </p>
          )}
        </Card>
      )}

      {/* ── STEP 5: Review ────────────────────────────────────── */}
      {step===5 && (
        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-bold text-slate-700 mb-3">Review & Konfirmasi</h2>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
              <p className="text-xs font-semibold text-amber-700">⚠ Periksa kembali semua data sebelum mengirim.</p>
            </div>
            {/* Nomor pengajuan final */}
            <div className="bg-slate-800 rounded-xl px-4 py-3 mb-3 text-center">
              <p className="text-[10px] text-slate-400 mb-1">Nomor Pengajuan</p>
              <p className="text-base font-black text-amber-400">{buildNomor(form.nomorUrut, form.type, form.cabangManual)}</p>
            </div>
            {[
              ['Jenis', form.type], ['Pemohon', user?.name], ['Kendaraan', form.kendaraan],
              ['Jenis Pembelian', form.jenis_pembelian],
              ['Vendor 1', form.vendor],
              ...(form.rekening_tujuan ? [['Rekening', form.rekening_tujuan]] : []),
              ['Total Vendor 1', fmtCurrency(total1)],
              ...(form.useVendor2 ? [['Vendor 2', form.vendor2], ['Total Vendor 2', fmtCurrency(total2)]] : []),
              ['Batas Waktu Dana', form.batas_waktu_dana],
              ['Batas Akhir Bayar', form.batas_akhir_pembayaran],
              ['Foto Terlampir', `${photos.length} foto`],
            ].map(([k,v],i,arr) => (
              <div key={k} className={`flex justify-between gap-4 py-2 ${i<arr.length-1?'border-b border-slate-50':''}`}>
                <span className="text-xs text-slate-400 flex-shrink-0">{k}</span>
                <span className="text-xs font-bold text-slate-700 text-right">{v}</span>
              </div>
            ))}
          </Card>
          {form.riwayat && (
            <Card>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Preview Riwayat:</p>
              <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200">
                {form.riwayat}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pb-4">
        {step>0 && <Button variant="secondary" className="flex-1" onClick={handleBack}>← Kembali</Button>}
        {step<STEPS.length-1
          ? <Button className="flex-1" onClick={handleNext}>Lanjut →</Button>
          : <Button variant="success" className="flex-1" onClick={submit} loading={loading}>✓ Kirim Pengajuan</Button>
        }
      </div>
    </div>
  );
}
