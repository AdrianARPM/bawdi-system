// src/pages/NewFormPage.jsx  — v2 (Dual Vendor + Photo Upload)
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Check, ChevronLeft, Upload, X, Image, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { submissionAPI, photoAPI, offlineQueue } from '../utils/api';
import { Card, Input, Textarea, Button, fmtCurrency } from '../components/ui';
import useAuthStore from '../context/authStore';

const STEPS = ['Jenis', 'Pemohon', 'Vendor 1', 'Vendor 2', 'Foto', 'Review'];

// Komponen upload foto
function PhotoUploader({ photos, onAdd, onRemove }) {
  const inputRef = useRef();

  const handleFile = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} terlalu besar (maks 10MB)`); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        onAdd({ id: Date.now() + Math.random(), name: file.name, type: file.type, data: ev.target.result, size: file.size });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={handleFile} />
      <button type="button" onClick={() => inputRef.current?.click()}
        className="w-full border-2 border-dashed border-slate-300 hover:border-amber-400 rounded-2xl p-6 flex flex-col items-center gap-2 transition-colors group">
        <div className="w-12 h-12 rounded-full bg-amber-50 group-hover:bg-amber-100 flex items-center justify-center transition-colors">
          <Upload size={20} className="text-amber-500" />
        </div>
        <p className="text-sm font-semibold text-slate-600">Klik untuk upload foto</p>
        <p className="text-xs text-slate-400">JPG, PNG, WEBP, PDF • Maks 10MB per file • Bisa multiple</p>
      </button>

      {photos.length > 0 && (
        <div className="mt-3 space-y-2">
          {photos.map(photo => (
            <div key={photo.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-200 flex-shrink-0 flex items-center justify-center">
                {photo.type?.startsWith('image/') ? (
                  <img src={photo.data} alt={photo.name} className="w-full h-full object-cover" />
                ) : (
                  <Image size={16} className="text-slate-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{photo.name}</p>
                <p className="text-[10px] text-slate-400">{(photo.size / 1024).toFixed(0)} KB</p>
              </div>
              <button type="button" onClick={() => onRemove(photo.id)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NewFormPage() {
  const { user } = useAuthStore();
  const navigate  = useNavigate();
  const [step,    setStep]    = useState(0);
  const [loading, setLoading] = useState(false);
  const [photos,  setPhotos]  = useState([]);
  const [form, setForm] = useState({
    type: 'PR',
    kendaraan: '', jenis_pembelian: '',
    // Vendor 1
    vendor: '', npwp: '',
    items1: [{ id: 1, penjelasan: '', satuan: '1 Kali', harga: '' }],
    // Vendor 2 (opsional)
    useVendor2: false,
    vendor2: '', npwp2: '',
    items2: [{ id: 1, penjelasan: '', satuan: '1 Kali', harga: '' }],
    // Keterangan
    alasan: '', riwayat: '',
    batas_waktu_dana: '', batas_akhir_pembayaran: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const total1 = form.items1.reduce((s, i) => s + (parseFloat(i.harga) || 0), 0);
  const total2 = form.items2.reduce((s, i) => s + (parseFloat(i.harga) || 0), 0);

  const updateItem = (listKey, idx, field, value) => {
    const list = form[listKey].map((it, i) => i === idx ? { ...it, [field]: value } : it);
    set(listKey, list);
  };
  const addItem    = (listKey) => set(listKey, [...form[listKey], { id: Date.now(), penjelasan: '', satuan: '1 Kali', harga: '' }]);
  const removeItem = (listKey, idx) => set(listKey, form[listKey].filter((_, i) => i !== idx));

  const canNext = () => {
    if (step === 1) return form.kendaraan && form.jenis_pembelian;
    if (step === 2) return form.vendor && form.items1.every(i => i.penjelasan && i.harga) && form.alasan && form.riwayat && form.batas_waktu_dana && form.batas_akhir_pembayaran;
    if (step === 3) return !form.useVendor2 || (form.vendor2 && form.items2.every(i => i.penjelasan && i.harga));
    if (step === 4) return photos.length > 0; // foto wajib
    return true;
  };

  // Step 3 (Vendor 2) bisa dilewati jika tidak pakai vendor 2
  const handleNext = () => {
    if (step === 3 && !form.useVendor2) { setStep(4); return; }
    setStep(s => s + 1);
  };

  const submit = async () => {
    setLoading(true);
    try {
      // Gabungkan items dengan vendor_num
      const items = [
        ...form.items1.map(i => ({ ...i, vendor_num: 1, harga: parseFloat(i.harga) || 0 })),
        ...(form.useVendor2 ? form.items2.map(i => ({ ...i, vendor_num: 2, harga: parseFloat(i.harga) || 0 })) : []),
      ];

      const payload = {
        type: form.type, kendaraan: form.kendaraan, jenis_pembelian: form.jenis_pembelian,
        vendor: form.vendor, npwp: form.npwp,
        vendor2: form.useVendor2 ? form.vendor2 : '', npwp2: form.useVendor2 ? form.npwp2 : '',
        alasan: form.alasan, riwayat: form.riwayat,
        batas_waktu_dana: form.batas_waktu_dana, batas_akhir_pembayaran: form.batas_akhir_pembayaran,
        items,
      };

      let submissionId;
      if (navigator.onLine) {
        const { data } = await submissionAPI.create(payload);
        submissionId = data.id;

        // Upload foto satu per satu
        if (photos.length > 0) {
          toast.loading('Mengupload foto...', { id: 'photo-upload' });
          for (const photo of photos) {
            try {
              await photoAPI.upload(submissionId, {
                fileName: photo.name,
                fileData: photo.data,
                fileType: photo.type,
              });
            } catch (err) {
              console.error('Gagal upload foto:', photo.name, err);
              toast.error(`Gagal upload: ${photo.name}`);
            }
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

  const inp = (label, val, onChange, props = {}) => (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1.5">{label}</label>
      <input value={val} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-50 disabled:text-slate-400"
        {...props} />
    </div>
  );

  const ItemsForm = ({ listKey, total }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-600">Item / Rincian Pekerjaan *</label>
        <button type="button" onClick={() => addItem(listKey)}
          className="flex items-center gap-1 text-xs font-bold text-amber-500 hover:text-amber-600">
          <Plus size={13} /> Tambah Item
        </button>
      </div>
      {form[listKey].map((item, idx) => (
        <div key={item.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
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
            rows={2} placeholder="Penjelasan: apa yang akan diganti/diperbaiki, merek, ukuran..."
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 outline-none resize-none focus:border-amber-400 placeholder:text-slate-300" />
          <div className="grid grid-cols-2 gap-2">
            <input value={item.satuan} onChange={e => updateItem(listKey, idx, 'satuan', e.target.value)}
              placeholder="Satuan (2 Buah...)"
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 outline-none focus:border-amber-400" />
            <input type="number" value={item.harga} onChange={e => updateItem(listKey, idx, 'harga', e.target.value)}
              placeholder="Harga (Rp)"
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 outline-none focus:border-amber-400" />
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

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50">
          <ChevronLeft size={18} className="text-slate-600" />
        </button>
        <div>
          <h1 className="text-xl font-black text-slate-800">Buat Pengajuan Baru</h1>
          <p className="text-xs text-slate-400">Langkah {step + 1} dari {STEPS.length}</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center overflow-x-auto pb-1 scrollbar-hide">
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
            {i < STEPS.length - 1 && <div className={`w-6 h-0.5 mx-1 mb-3 flex-shrink-0 ${i < step ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
          </div>
        ))}
      </div>

      <Card>
        {/* STEP 0 — Jenis */}
        {step === 0 && (
          <div>
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
          </div>
        )}

        {/* STEP 1 — Pemohon */}
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-700">Data Kendaraan & Pembelian</h2>
            <div className="grid grid-cols-2 gap-3">
              {inp('Nama Pemohon', user?.name, ()=>{}, { disabled: true })}
              {inp('Cabang / Project', user?.cabang, ()=>{}, { disabled: true })}
            </div>
            {inp('Kendaraan / Plat Nomor *', form.kendaraan, v => set('kendaraan', v), { placeholder: 'Contoh: B 9138 PCF' })}
            {inp('Jenis Pembelian *', form.jenis_pembelian, v => set('jenis_pembelian', v), { placeholder: 'Contoh: Service Kendaraan' })}
            <div className="space-y-3">
              <Textarea label="Alasan Pengajuan *" value={form.alasan} onChange={e => set('alasan', e.target.value)}
                rows={3} placeholder="Jelaskan alasan secara rinci..." />
              <Textarea label="Riwayat Service / Penggantian Sebelumnya *" value={form.riwayat}
                onChange={e => set('riwayat', e.target.value)} rows={3} placeholder="Tuliskan riwayat lengkap..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {inp('Batas Waktu Dana *', form.batas_waktu_dana, v => set('batas_waktu_dana', v), { placeholder: '3 Hari' })}
              {inp('Batas Akhir Pembayaran *', form.batas_akhir_pembayaran, v => set('batas_akhir_pembayaran', v), { type: 'date' })}
            </div>
          </div>
        )}

        {/* STEP 2 — Vendor 1 */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-black">1</span>
              </div>
              <h2 className="text-sm font-bold text-slate-700">Vendor / Bengkel Pertama</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {inp('Nama Vendor / Bengkel *', form.vendor, v => set('vendor', v), { placeholder: 'Bengkel Maju Jaya' })}
              {inp('No. NPWP Vendor (opsional)', form.npwp, v => set('npwp', v), { placeholder: 'XX.XXX.XXX...' })}
            </div>
            <ItemsForm listKey="items1" total={total1} />
          </div>
        )}

        {/* STEP 3 — Vendor 2 */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-black">2</span>
              </div>
              <h2 className="text-sm font-bold text-slate-700">Vendor / Bengkel Kedua <span className="text-slate-400 font-normal">(perbandingan)</span></h2>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
              <button type="button" onClick={() => set('useVendor2', !form.useVendor2)}
                className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.useVendor2 ? 'bg-amber-500' : 'bg-slate-300'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${form.useVendor2 ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <div>
                <p className="text-sm font-semibold text-slate-700">Tambahkan Vendor Pembanding</p>
                <p className="text-xs text-slate-400">Approval akan memilih vendor terbaik berdasarkan perbandingan</p>
              </div>
            </div>

            {form.useVendor2 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {inp('Nama Vendor / Bengkel *', form.vendor2, v => set('vendor2', v), { placeholder: 'Bengkel Prima Motor' })}
                  {inp('No. NPWP Vendor (opsional)', form.npwp2, v => set('npwp2', v), { placeholder: 'XX.XXX.XXX...' })}
                </div>
                <ItemsForm listKey="items2" total={total2} />

                {/* Perbandingan harga */}
                {total1 > 0 && total2 > 0 && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                    <p className="text-xs font-bold text-slate-500 mb-2">PERBANDINGAN HARGA</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className={`p-2.5 rounded-xl text-center border-2 ${total1 <= total2 ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>
                        <p className="text-[10px] text-slate-500 mb-1">Vendor 1</p>
                        <p className="text-sm font-black text-emerald-600">{fmtCurrency(total1)}</p>
                        {total1 <= total2 && <p className="text-[10px] text-emerald-500 font-bold mt-0.5">✓ Lebih hemat</p>}
                      </div>
                      <div className={`p-2.5 rounded-xl text-center border-2 ${total2 < total1 ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>
                        <p className="text-[10px] text-slate-500 mb-1">Vendor 2</p>
                        <p className="text-sm font-black text-blue-600">{fmtCurrency(total2)}</p>
                        {total2 < total1 && <p className="text-[10px] text-emerald-500 font-bold mt-0.5">✓ Lebih hemat</p>}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 text-center mt-2">Selisih: {fmtCurrency(Math.abs(total1 - total2))}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* STEP 4 — Foto */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-700 mb-1">Lampiran Foto *</h2>
              <p className="text-xs text-slate-400 mb-4">Foto kondisi kendaraan, kerusakan, atau dokumen pendukung. <strong className="text-red-500">Wajib minimal 1 foto.</strong></p>
            </div>
            <PhotoUploader
              photos={photos}
              onAdd={photo => setPhotos(prev => [...prev, photo])}
              onRemove={id => setPhotos(prev => prev.filter(p => p.id !== id))}
            />
            {photos.length === 0 && (
              <p className="text-xs text-red-500 text-center">⚠ Minimal 1 foto harus dilampirkan</p>
            )}
          </div>
        )}

        {/* STEP 5 — Review */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-700">Review & Konfirmasi</h2>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-700">⚠ Periksa kembali sebelum mengirim. Pengajuan yang sudah dikirim tidak bisa diedit.</p>
            </div>
            {[
              ['Jenis', form.type], ['Pemohon', user?.name], ['Kendaraan', form.kendaraan],
              ['Jenis Pembelian', form.jenis_pembelian],
              ['Vendor 1', form.vendor], ['Total Vendor 1', fmtCurrency(total1)],
              ...(form.useVendor2 ? [['Vendor 2', form.vendor2], ['Total Vendor 2', fmtCurrency(total2)]] : []),
              ['Batas Waktu Dana', form.batas_waktu_dana],
              ['Batas Akhir Bayar', form.batas_akhir_pembayaran],
              ['Foto Terlampir', `${photos.length} foto`],
            ].map(([k,v],i,arr) => (
              <div key={k} className={`flex justify-between gap-4 py-2 ${i<arr.length-1?'border-b border-slate-50':''}`}>
                <span className="text-xs text-slate-400">{k}</span>
                <span className="text-xs font-bold text-slate-700 text-right">{v}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Navigation */}
      <div className="flex gap-3 pb-4">
        {step > 0 && (
          <Button variant="secondary" className="flex-1" onClick={() => setStep(s => s-1)}>← Kembali</Button>
        )}
        {step < STEPS.length - 1
          ? <Button className="flex-1" onClick={handleNext} disabled={!canNext()}>Lanjut →</Button>
          : <Button variant="success" className="flex-1" onClick={submit} loading={loading}>✓ Kirim Pengajuan</Button>
        }
      </div>
    </div>
  );
}
