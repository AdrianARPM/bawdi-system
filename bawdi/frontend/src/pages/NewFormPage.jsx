// src/pages/NewFormPage.jsx  — v5
// Fitur baru:
// 1. Validasi wajib semua field (kecuali vendor 2 opsional)
// 2. Riwayat textarea mendukung Enter/line break
// 3. Panel riwayat kendaraan otomatis muncul saat isi kendaraan + item
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Check, ChevronLeft, Upload, X, Image, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { submissionAPI, photoAPI, offlineQueue } from '../utils/api';
import { Card, Input, Button, fmtCurrency } from '../components/ui';
import VehicleHistoryPanel from '../components/VehicleHistoryPanel';
import useAuthStore from '../context/authStore';

const STEPS = ['Jenis', 'Pemohon', 'Vendor 1', 'Vendor 2', 'Foto', 'Review'];

/* ── Komponen upload foto ─────────────────────────────────────── */
function PhotoUploader({ photos, onAdd, onRemove }) {
  const inputRef = useRef();
  const handleFile = (e) => {
    Array.from(e.target.files).forEach(file => {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} terlalu besar (maks 10MB)`); return; }
      const reader = new FileReader();
      reader.onload = (ev) =>
        onAdd({ id: Date.now() + Math.random(), name: file.name, type: file.type, data: ev.target.result, size: file.size });
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={handleFile} />
      <button type="button" onClick={() => inputRef.current?.click()}
        className="w-full border-2 border-dashed border-slate-300 hover:border-amber-400 rounded-2xl p-6 flex flex-col items-center gap-2 transition-colors group">
        <div className="w-12 h-12 rounded-full bg-amber-50 group-hover:bg-amber-100 flex items-center justify-center">
          <Upload size={20} className="text-amber-500" />
        </div>
        <p className="text-sm font-semibold text-slate-600">Klik untuk upload foto</p>
        <p className="text-xs text-slate-400">JPG, PNG, WEBP, PDF • Maks 10MB • Bisa multiple</p>
      </button>
      {photos.length > 0 && (
        <div className="mt-3 space-y-2">
          {photos.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-200 flex-shrink-0 flex items-center justify-center">
                {p.type?.startsWith('image/')
                  ? <img src={p.data} alt={p.name} className="w-full h-full object-cover" />
                  : <Image size={16} className="text-slate-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{p.name}</p>
                <p className="text-[10px] text-slate-400">{(p.size / 1024).toFixed(0)} KB</p>
              </div>
              <button type="button" onClick={() => onRemove(p.id)} className="text-red-400 hover:text-red-600">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Komponen field dengan validasi ──────────────────────────── */
function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-500 mt-1 font-medium">
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function NewFormPage() {
  const { user }   = useAuthStore();
  const navigate   = useNavigate();
  const [step,     setStep]    = useState(0);
  const [loading,  setLoading] = useState(false);
  const [photos,   setPhotos]  = useState([]);
  const [errors,   setErrors]  = useState({});  // validasi errors

  const [form, setForm] = useState({
    type: 'PR',
    kendaraan: '', jenis_pembelian: '',
    vendor: '', npwp: '',
    items1: [{ id: 1, penjelasan: '', satuan: '', harga: '' }],
    useVendor2: false,
    vendor2: '', npwp2: '',
    items2: [{ id: 1, penjelasan: '', satuan: '', harga: '' }],
    alasan: '',
    riwayat: '',   // mendukung newline/paragraph
    batas_waktu_dana: '', batas_akhir_pembayaran: '',
  });

  // Keyword untuk pencarian riwayat — gabungan penjelasan item1
  const historyKeyword = form.items1
    .map(i => i.penjelasan)
    .filter(Boolean)
    .join(' ')
    .substring(0, 50);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };
  const total1 = form.items1.reduce((s, i) => s + (parseFloat(i.harga) || 0), 0);
  const total2 = form.items2.reduce((s, i) => s + (parseFloat(i.harga) || 0), 0);

  const updateItem = (listKey, idx, field, value) => {
    const list = form[listKey].map((it, i) => i === idx ? { ...it, [field]: value } : it);
    set(listKey, list);
  };
  const addItem    = (k) => set(k, [...form[k], { id: Date.now(), penjelasan: '', satuan: '', harga: '' }]);
  const removeItem = (k, idx) => set(k, form[k].filter((_, i) => i !== idx));

  /* ── Validasi per step ──────────────────────────────────────── */
  const validate = (currentStep) => {
    const e = {};

    if (currentStep === 1) {
      if (!form.kendaraan.trim())        e.kendaraan        = 'Plat kendaraan wajib diisi';
      if (!form.jenis_pembelian.trim())  e.jenis_pembelian  = 'Jenis pembelian wajib diisi';
      if (!form.alasan.trim())           e.alasan           = 'Alasan pengajuan wajib diisi';
      if (!form.riwayat.trim())          e.riwayat          = 'Riwayat wajib diisi (bisa singkat)';
      if (!form.batas_waktu_dana.trim()) e.batas_waktu_dana = 'Batas waktu dana wajib diisi';
      if (!form.batas_akhir_pembayaran)  e.batas_akhir_pembayaran = 'Batas akhir pembayaran wajib diisi';
    }

    if (currentStep === 2) {
      if (!form.vendor.trim()) e.vendor = 'Nama vendor/bengkel wajib diisi';
      form.items1.forEach((item, i) => {
        if (!item.penjelasan.trim()) e[`item1_${i}_penjelasan`] = `Item ${i+1}: penjelasan wajib diisi`;
        if (!item.satuan.trim())     e[`item1_${i}_satuan`]     = `Item ${i+1}: satuan wajib diisi`;
        if (!item.harga || parseFloat(item.harga) <= 0) e[`item1_${i}_harga`] = `Item ${i+1}: harga wajib diisi`;
      });
    }

    if (currentStep === 3 && form.useVendor2) {
      if (!form.vendor2.trim()) e.vendor2 = 'Nama vendor 2 wajib diisi jika diaktifkan';
      form.items2.forEach((item, i) => {
        if (!item.penjelasan.trim()) e[`item2_${i}_penjelasan`] = `Item ${i+1}: penjelasan wajib diisi`;
        if (!item.satuan.trim())     e[`item2_${i}_satuan`]     = `Item ${i+1}: satuan wajib diisi`;
        if (!item.harga || parseFloat(item.harga) <= 0) e[`item2_${i}_harga`] = `Item ${i+1}: harga wajib diisi`;
      });
    }

    if (currentStep === 4) {
      if (photos.length === 0) e.photos = 'Minimal 1 foto wajib dilampirkan';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (!validate(step)) {
      toast.error('Lengkapi semua field yang wajib diisi terlebih dahulu');
      return;
    }
    // Skip vendor 2 jika tidak dipakai
    if (step === 3 && !form.useVendor2) { setStep(4); return; }
    setStep(s => s + 1);
  };

  const handleBack = () => {
    setErrors({});
    if (step === 4 && !form.useVendor2) { setStep(2); return; }
    setStep(s => s - 1);
  };

  /* ── Submit ─────────────────────────────────────────────────── */
  const submit = async () => {
    if (!validate(step)) { toast.error('Lengkapi semua field yang wajib diisi'); return; }
    setLoading(true);
    try {
      const items = [
        ...form.items1.map(i => ({ ...i, vendor_num: 1, harga: parseFloat(i.harga) || 0 })),
        ...(form.useVendor2 ? form.items2.map(i => ({ ...i, vendor_num: 2, harga: parseFloat(i.harga) || 0 })) : []),
      ];
      const payload = {
        type: form.type, kendaraan: form.kendaraan, jenis_pembelian: form.jenis_pembelian,
        vendor: form.vendor, npwp: form.npwp,
        vendor2: form.useVendor2 ? form.vendor2 : '', npwp2: form.useVendor2 ? form.npwp2 : '',
        alasan: form.alasan,
        riwayat: form.riwayat, // sudah support newline dari textarea
        batas_waktu_dana: form.batas_waktu_dana,
        batas_akhir_pembayaran: form.batas_akhir_pembayaran,
        items,
      };

      let submissionId;
      if (navigator.onLine) {
        const { data } = await submissionAPI.create(payload);
        submissionId = data.id;

        if (photos.length > 0) {
          toast.loading('Mengupload foto...', { id: 'photo-upload' });
          for (const photo of photos) {
            try {
              await photoAPI.upload(submissionId, { fileName: photo.name, fileData: photo.data, fileType: photo.type });
            } catch { toast.error(`Gagal upload: ${photo.name}`); }
          }
          toast.dismiss('photo-upload');
        }

        toast.success('Pengajuan berhasil dikirim!');
        navigate(`/submissions/${submissionId}`);
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

  /* ── Helper render input ─────────────────────────────────────── */
  const inp = (label, val, onChange, props = {}, required = true) => (
    <Field label={label} required={required} error={errors[props.name || label]}>
      <input value={val} onChange={e => onChange(e.target.value)}
        className={`w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none transition-all
          placeholder:text-slate-300 disabled:bg-slate-50 disabled:text-slate-400
          ${errors[props.name || label]
            ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-50'
            : 'border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'}`}
        {...props}
      />
    </Field>
  );

  /* ── Items form (dengan validasi per item) ───────────────────── */
  const ItemsForm = ({ listKey, total, vendorNum }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-600">
          Item / Rincian Pekerjaan <span className="text-red-500">*</span>
        </label>
        <button type="button" onClick={() => addItem(listKey)}
          className="flex items-center gap-1 text-xs font-bold text-amber-500 hover:text-amber-600">
          <Plus size={13} /> Tambah Item
        </button>
      </div>
      {form[listKey].map((item, idx) => (
        <div key={item.id} className={`border rounded-xl p-3 space-y-2 ${
          errors[`item${vendorNum}_${idx}_penjelasan`] ||
          errors[`item${vendorNum}_${idx}_satuan`] ||
          errors[`item${vendorNum}_${idx}_harga`]
            ? 'border-red-300 bg-red-50'
            : 'border-slate-200'
        }`}>
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400">ITEM {idx + 1}</span>
            {form[listKey].length > 1 && (
              <button type="button" onClick={() => removeItem(listKey, idx)}>
                <Trash2 size={13} className="text-red-400 hover:text-red-600" />
              </button>
            )}
          </div>
          <textarea value={item.penjelasan}
            onChange={e => updateItem(listKey, idx, 'penjelasan', e.target.value)}
            rows={2}
            placeholder="Penjelasan item: apa yang akan diganti/diperbaiki, merek, ukuran, kondisi..."
            className={`w-full px-3 py-2 rounded-xl border text-sm text-slate-700 outline-none resize-none focus:border-amber-400 placeholder:text-slate-300 ${
              errors[`item${vendorNum}_${idx}_penjelasan`] ? 'border-red-300 bg-red-50' : 'border-slate-200'
            }`}
          />
          {errors[`item${vendorNum}_${idx}_penjelasan`] && (
            <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={10}/> Wajib diisi</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <input value={item.satuan}
                onChange={e => updateItem(listKey, idx, 'satuan', e.target.value)}
                placeholder="Satuan (2 Buah, 1 Set...)"
                className={`w-full px-3 py-2 rounded-xl border text-sm text-slate-700 outline-none focus:border-amber-400 placeholder:text-slate-300 ${
                  errors[`item${vendorNum}_${idx}_satuan`] ? 'border-red-300 bg-red-50' : 'border-slate-200'
                }`}
              />
              {errors[`item${vendorNum}_${idx}_satuan`] && (
                <p className="text-[10px] text-red-500 mt-0.5">Wajib diisi</p>
              )}
            </div>
            <div>
              <input type="number" value={item.harga}
                onChange={e => updateItem(listKey, idx, 'harga', e.target.value)}
                placeholder="Harga (Rp)"
                className={`w-full px-3 py-2 rounded-xl border text-sm text-slate-700 outline-none focus:border-amber-400 placeholder:text-slate-300 ${
                  errors[`item${vendorNum}_${idx}_harga`] ? 'border-red-300 bg-red-50' : 'border-slate-200'
                }`}
              />
              {errors[`item${vendorNum}_${idx}_harga`] && (
                <p className="text-[10px] text-red-500 mt-0.5">Wajib diisi</p>
              )}
            </div>
          </div>
          {item.harga && <p className="text-xs text-amber-500 font-semibold">{fmtCurrency(parseFloat(item.harga))}</p>}
        </div>
      ))}
      <div className="flex justify-between items-center bg-amber-50 rounded-xl px-3 py-2.5">
        <span className="text-sm font-extrabold text-amber-800">TOTAL</span>
        <span className="text-base font-black text-amber-500">{fmtCurrency(total)}</span>
      </div>
    </div>
  );

  /* ── Indikator step ─────────────────────────────────────────── */
  const StepIndicator = () => (
    <div className="flex items-center overflow-x-auto pb-1 scrollbar-hide gap-0">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center flex-shrink-0">
          <div className="flex flex-col items-center">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-400'
            }`}>
              {i < step ? <Check size={12} /> : i + 1}
            </div>
            <span className={`text-[9px] mt-1 font-medium whitespace-nowrap ${i === step ? 'text-amber-500' : 'text-slate-400'}`}>{s}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`w-5 h-0.5 mx-1 mb-3 flex-shrink-0 ${i < step ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50">
          <ChevronLeft size={18} className="text-slate-600" />
        </button>
        <div>
          <h1 className="text-xl font-black text-slate-800">Buat Pengajuan Baru</h1>
          <p className="text-xs text-slate-400 mt-0.5">Langkah {step + 1} dari {STEPS.length} — Field bertanda <span className="text-red-500 font-bold">*</span> wajib diisi</p>
        </div>
      </div>

      <StepIndicator />

      {/* ── STEP 0: Jenis ─────────────────────────────────────── */}
      {step === 0 && (
        <Card>
          <h2 className="text-sm font-bold text-slate-700 mb-4">Pilih Jenis Pengajuan</h2>
          <div className="grid grid-cols-2 gap-3">
            {[['PR','Purchase Requisition','Permintaan pembelian barang/jasa rutin'],
              ['PAR','Purchase Auth. Request','Otorisasi pembelian nilai besar']].map(([t,title,desc]) => (
              <button key={t} type="button" onClick={() => set('type', t)}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${form.type===t?'border-amber-500 bg-amber-50':'border-slate-200 hover:border-slate-300'}`}>
                <p className={`text-2xl font-black mb-1 ${form.type===t?'text-amber-500':'text-slate-300'}`}>{t}</p>
                <p className="text-xs font-bold text-slate-700 mb-0.5">{title}</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">{desc}</p>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ── STEP 1: Pemohon + Keterangan ──────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-bold text-slate-700 mb-4">Data Kendaraan & Pembelian</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {inp('Nama Pemohon', user?.name, ()=>{}, { disabled: true }, false)}
                {inp('Cabang / Project', user?.cabang, ()=>{}, { disabled: true }, false)}
              </div>
              {inp('Kendaraan / Plat Nomor', form.kendaraan, v => set('kendaraan', v), {
                placeholder: 'Contoh: BM 1234 ZZ', name: 'kendaraan'
              })}
              {inp('Jenis Pembelian', form.jenis_pembelian, v => set('jenis_pembelian', v), {
                placeholder: 'Contoh: Penggantian Ban, Service Berkala', name: 'jenis_pembelian'
              })}

              {/* Alasan */}
              <Field label="Alasan Pengajuan" required error={errors.alasan}>
                <textarea value={form.alasan} onChange={e => { set('alasan', e.target.value); }}
                  rows={3} placeholder="Jelaskan alasan pengajuan secara rinci..."
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none resize-none placeholder:text-slate-300 transition-all ${
                    errors.alasan ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
                  }`}
                />
              </Field>

              {/* Riwayat — mendukung paragraph (Enter = newline) */}
              <Field label="Riwayat Service / Penggantian Sebelumnya" required error={errors.riwayat}>
                <textarea value={form.riwayat}
                  onChange={e => set('riwayat', e.target.value)}
                  rows={5}
                  placeholder={`Tuliskan riwayat lengkap. Bisa per baris, contoh:\n\n15 Jan 2025 — Ganti oli di Bengkel ABC, biaya Rp 150.000\n3 Mar 2025 — Service rutin, biaya Rp 300.000\n\nTekan Enter untuk baris baru.`}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none resize-none placeholder:text-slate-300 transition-all leading-relaxed ${
                    errors.riwayat ? 'border-red-300 bg-red-50 focus:border-red-400' : 'border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
                  }`}
                />
                <p className="text-[10px] text-slate-400 mt-1">💡 Tekan Enter untuk baris baru / paragraph baru</p>
              </Field>

              {/* Batas waktu */}
              <div className="grid grid-cols-2 gap-3">
                {inp('Batas Waktu Dana', form.batas_waktu_dana, v => set('batas_waktu_dana', v), {
                  placeholder: 'Contoh: 3 Hari', name: 'batas_waktu_dana'
                })}
                <Field label="Batas Akhir Pembayaran" required error={errors.batas_akhir_pembayaran}>
                  <input type="date" value={form.batas_akhir_pembayaran}
                    onChange={e => set('batas_akhir_pembayaran', e.target.value)}
                    className={`w-full px-3 py-2.5 rounded-xl border text-sm text-slate-800 outline-none transition-all ${
                      errors.batas_akhir_pembayaran ? 'border-red-300 bg-red-50' : 'border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
                    }`}
                  />
                </Field>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── STEP 2: Vendor 1 ──────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                <span className="text-white text-[10px] font-black">1</span>
              </div>
              <h2 className="text-sm font-bold text-slate-700">Vendor / Bengkel Pertama</h2>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nama Vendor / Bengkel" required error={errors.vendor}>
                  <input value={form.vendor} onChange={e => set('vendor', e.target.value)}
                    placeholder="Bengkel Maju Jaya"
                    className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-all placeholder:text-slate-300 ${
                      errors.vendor ? 'border-red-300 bg-red-50' : 'border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
                    }`}
                  />
                </Field>
                {inp('No. NPWP/KTP Vendor', form.npwp, v => set('npwp', v), { placeholder: 'XX.XXX.XXX... (opsional)' }, false)}
              </div>
              <ItemsForm listKey="items1" total={total1} vendorNum={1} />
            </div>
          </Card>

          {/* Panel riwayat kendaraan — muncul otomatis */}
          {form.kendaraan?.trim() && (
            <VehicleHistoryPanel
              kendaraan={form.kendaraan}
              keyword={historyKeyword}
            />
          )}
        </div>
      )}

      {/* ── STEP 3: Vendor 2 ──────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
                <span className="text-white text-[10px] font-black">2</span>
              </div>
              <h2 className="text-sm font-bold text-slate-700">
                Vendor Pembanding <span className="text-slate-400 font-normal text-xs">(opsional)</span>
              </h2>
            </div>

            {/* Toggle vendor 2 */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-4">
              <button type="button" onClick={() => { set('useVendor2', !form.useVendor2); setErrors(e => ({ ...e, vendor2: '' })); }}
                className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.useVendor2 ? 'bg-amber-500' : 'bg-slate-300'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${form.useVendor2 ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <div>
                <p className="text-sm font-semibold text-slate-700">Tambahkan Vendor Pembanding</p>
                <p className="text-xs text-slate-400">Approval akan membandingkan dan memilih vendor terbaik</p>
              </div>
            </div>

            {form.useVendor2 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nama Vendor / Bengkel 2" required error={errors.vendor2}>
                    <input value={form.vendor2} onChange={e => set('vendor2', e.target.value)}
                      placeholder="Bengkel Prima Motor"
                      className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-all placeholder:text-slate-300 ${
                        errors.vendor2 ? 'border-red-300 bg-red-50' : 'border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'
                      }`}
                    />
                  </Field>
                  {inp('No. NPWP/KTP Vendor 2', form.npwp2, v => set('npwp2', v), { placeholder: 'Opsional' }, false)}
                </div>
                <ItemsForm listKey="items2" total={total2} vendorNum={2} />

                {/* Perbandingan harga */}
                {total1 > 0 && total2 > 0 && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                    <p className="text-xs font-bold text-slate-500 mb-2">PERBANDINGAN HARGA</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[['Vendor 1', total1, 'blue'], ['Vendor 2', total2, 'orange']].map(([label, tot, color]) => (
                        <div key={label} className={`p-2.5 rounded-xl text-center border-2 ${
                          (label==='Vendor 1'?total1:total2) <= (label==='Vendor 1'?total2:total1)
                            ? 'border-emerald-400 bg-emerald-50'
                            : 'border-slate-200'
                        }`}>
                          <p className="text-[10px] text-slate-500 mb-1">{label}</p>
                          <p className={`text-sm font-black ${color==='blue'?'text-blue-600':'text-orange-500'}`}>
                            {fmtCurrency(tot)}
                          </p>
                          {tot <= (label==='Vendor 1'?total2:total1) && (
                            <p className="text-[10px] text-emerald-500 font-bold mt-0.5">✓ Lebih hemat</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 text-center mt-2">
                      Selisih: {fmtCurrency(Math.abs(total1 - total2))}
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── STEP 4: Foto ──────────────────────────────────────── */}
      {step === 4 && (
        <Card>
          <div className="mb-4">
            <h2 className="text-sm font-bold text-slate-700 mb-1">
              Lampiran Foto <span className="text-red-500">*</span>
            </h2>
            <p className="text-xs text-slate-400">
              Foto kondisi kendaraan/kerusakan sebagai bahan pertimbangan approval.
              <strong className="text-red-500"> Minimal 1 foto wajib dilampirkan.</strong>
            </p>
          </div>
          <PhotoUploader
            photos={photos}
            onAdd={p => { setPhotos(prev => [...prev, p]); setErrors(e => ({ ...e, photos: '' })); }}
            onRemove={id => setPhotos(prev => prev.filter(p => p.id !== id))}
          />
          {errors.photos && (
            <p className="flex items-center gap-1 text-xs text-red-500 mt-2 font-medium">
              <AlertCircle size={11}/> {errors.photos}
            </p>
          )}
        </Card>
      )}

      {/* ── STEP 5: Review ────────────────────────────────────── */}
      {step === 5 && (
        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-bold text-slate-700 mb-3">Review & Konfirmasi</h2>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
              <p className="text-xs font-semibold text-amber-700">
                ⚠ Periksa kembali semua data. Pengajuan yang sudah dikirim tidak bisa diedit.
              </p>
            </div>
            {[
              ['Jenis', form.type], ['Pemohon', user?.name], ['Kendaraan', form.kendaraan],
              ['Jenis Pembelian', form.jenis_pembelian],
              ['Vendor 1', form.vendor], ['Total Vendor 1', fmtCurrency(total1)],
              ...(form.useVendor2 ? [['Vendor 2', form.vendor2], ['Total Vendor 2', fmtCurrency(total2)]] : []),
              ['Batas Waktu Dana', form.batas_waktu_dana],
              ['Batas Akhir Bayar', form.batas_akhir_pembayaran],
              ['Foto Terlampir', `${photos.length} foto`],
            ].map(([k,v], i, arr) => (
              <div key={k} className={`flex justify-between gap-4 py-2 ${i<arr.length-1?'border-b border-slate-50':''}`}>
                <span className="text-xs text-slate-400">{k}</span>
                <span className="text-xs font-bold text-slate-700 text-right">{v}</span>
              </div>
            ))}
          </Card>

          {/* Preview riwayat dengan line breaks */}
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

      {/* ── Navigation ────────────────────────────────────────── */}
      <div className="flex gap-3 pb-4">
        {step > 0 && (
          <Button variant="secondary" className="flex-1" onClick={handleBack}>← Kembali</Button>
        )}
        {step < STEPS.length - 1
          ? <Button className="flex-1" onClick={handleNext}>Lanjut →</Button>
          : <Button variant="success" className="flex-1" onClick={submit} loading={loading}>✓ Kirim Pengajuan</Button>
        }
      </div>
    </div>
  );
}
