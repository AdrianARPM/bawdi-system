// src/pages/NewFormPage.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Check, ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { submissionAPI, offlineQueue } from '../utils/api';
import { Card, Input, Textarea, Button, fmtCurrency } from '../components/ui';
import useAuthStore from '../context/authStore';

const STEPS = ['Jenis', 'Pemohon', 'Rincian', 'Review'];

export default function NewFormPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    type: 'PR',
    kendaraan: '', vendor: '', jenis_pembelian: '', npwp: '',
    alasan: '', riwayat: '',
    batas_waktu_dana: '', batas_akhir_pembayaran: '',
    items: [{ penjelasan: '', satuan: '1 Kali', harga: '' }],
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const totalHarga = form.items.reduce((s, i) => s + (parseFloat(i.harga) || 0), 0);

  const updateItem = (idx, field, value) => {
    const items = form.items.map((it, i) => i === idx ? { ...it, [field]: value } : it);
    set('items', items);
  };

  const addItem = () => set('items', [...form.items, { penjelasan: '', satuan: '1 Kali', harga: '' }]);
  const removeItem = (idx) => set('items', form.items.filter((_, i) => i !== idx));

  const submit = async () => {
    setLoading(true);
    const payload = {
      ...form,
      items: form.items.map(i => ({ ...i, harga: parseFloat(i.harga) || 0 })),
    };
    try {
      if (navigator.onLine) {
        const { data } = await submissionAPI.create(payload);
        toast.success('Pengajuan berhasil dikirim!');
        navigate(`/submissions/${data.id}`);
      } else {
        offlineQueue.add(payload);
        toast.success('Tersimpan offline. Akan dikirim saat koneksi kembali.', { duration: 5000 });
        navigate('/submissions');
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Gagal mengirim pengajuan';
      if (!navigator.onLine) {
        offlineQueue.add(payload);
        toast.success('Tersimpan offline. Akan dikirim saat koneksi kembali.', { duration: 5000 });
        navigate('/submissions');
      } else {
        toast.error(errMsg);
      }
    }
    setLoading(false);
  };

  const canNext = () => {
    if (step === 0) return true;
    if (step === 1) return form.kendaraan && form.vendor && form.jenis_pembelian;
    if (step === 2) return form.alasan && form.riwayat && form.items.every(i => i.penjelasan && i.harga) && form.batas_waktu_dana && form.batas_akhir_pembayaran;
    return true;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
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
      <div className="flex items-center">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-500 text-white' : 'bg-slate-200 text-slate-400'
              }`}>
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span className={`text-[10px] mt-1 font-medium ${i === step ? 'text-brand-500' : 'text-slate-400'}`}>{s}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1.5 mb-3.5 transition-all ${i < step ? 'bg-emerald-400' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* ─── STEP 0: Jenis ──────────────────────────────────────────── */}
      {step === 0 && (
        <Card>
          <h2 className="text-sm font-bold text-slate-700 mb-4">Pilih Jenis Pengajuan</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['PR', 'Purchase Requisition', 'Permintaan pembelian barang/jasa untuk kebutuhan operasional rutin'],
              ['PAR', 'Purchase Auth. Request', 'Otorisasi pembelian nilai besar di luar budget standar operasional'],
            ].map(([t, title, desc]) => (
              <button key={t} onClick={() => set('type', t)}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                  form.type === t ? 'border-brand-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}>
                <p className={`text-2xl font-black mb-1.5 ${form.type === t ? 'text-brand-500' : 'text-slate-300'}`}>{t}</p>
                <p className="text-xs font-bold text-slate-700 mb-1">{title}</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">{desc}</p>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ─── STEP 1: Pemohon ────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <h2 className="text-sm font-bold text-slate-700 mb-4">Data Pemohon & Vendor</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Nama Pemohon" value={user?.name} disabled />
              <Input label="Jabatan" value={user?.jabatan} disabled />
            </div>
            <Input label="Cabang / Project" value={user?.cabang} disabled />
            <Input label="Kendaraan / Plat Nomor *" value={form.kendaraan} onChange={e => set('kendaraan', e.target.value)} placeholder="Contoh: B 9138 PCF" />
            <Input label="Vendor / Bengkel yang Dituju *" value={form.vendor} onChange={e => set('vendor', e.target.value)} placeholder="Nama vendor atau bengkel" />
            <Input label="Jenis Pembelian *" value={form.jenis_pembelian} onChange={e => set('jenis_pembelian', e.target.value)} placeholder="Contoh: Service Kendaraan, Spare Part" />
            <Input label="No. NPWP Vendor (opsional)" value={form.npwp} onChange={e => set('npwp', e.target.value)} placeholder="XX.XXX.XXX.X-XXX.XXX" />
          </div>
        </Card>
      )}

      {/* ─── STEP 2: Rincian ────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-bold text-slate-700 mb-4">Keterangan Pengajuan</h2>
            <div className="space-y-3">
              <Textarea label="Alasan Pengajuan *" value={form.alasan} onChange={e => set('alasan', e.target.value)} rows={3}
                placeholder="Jelaskan alasan pergantian/service secara rinci dan jelas..." />
              <Textarea label="Riwayat Penggantian / Service Sebelumnya *" value={form.riwayat} onChange={e => set('riwayat', e.target.value)} rows={3}
                placeholder="Tuliskan riwayat lengkap service atau penggantian sebelumnya termasuk tanggal dan bengkel..." />
            </div>
          </Card>

          <Card padding={false}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-50">
              <h2 className="text-sm font-bold text-slate-700">Item Pengajuan *</h2>
              <button onClick={addItem} className="flex items-center gap-1 text-xs font-bold text-brand-500 hover:text-brand-600">
                <Plus size={13} /> Tambah Item
              </button>
            </div>
            {form.items.map((item, idx) => (
              <div key={idx} className="px-4 py-3 border-b border-slate-50 last:border-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-400">Item {idx + 1}</span>
                  {form.items.length > 1 && (
                    <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <textarea value={item.penjelasan}
                  onChange={e => updateItem(idx, 'penjelasan', e.target.value)}
                  rows={2} placeholder="Penjelasan rinci: apa yang akan diganti, merek, ukuran, alasan..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 outline-none resize-none focus:border-brand-400 focus:ring-2 focus:ring-brand-50 mb-2 placeholder:text-slate-400" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={item.satuan} onChange={e => updateItem(idx, 'satuan', e.target.value)}
                    placeholder="Satuan (1 Kali, 2 Buah...)"
                    className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 outline-none focus:border-brand-400" />
                  <input type="number" value={item.harga} onChange={e => updateItem(idx, 'harga', e.target.value)}
                    placeholder="Harga (Rp)"
                    className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 outline-none focus:border-brand-400" />
                </div>
                {item.harga && (
                  <p className="text-xs text-brand-500 font-semibold mt-1.5">{fmtCurrency(parseFloat(item.harga) || 0)}</p>
                )}
              </div>
            ))}
            <div className="flex justify-between items-center px-4 py-3 bg-amber-50">
              <span className="text-sm font-extrabold text-amber-800">TOTAL</span>
              <span className="text-base font-black text-brand-500">{fmtCurrency(totalHarga)}</span>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-slate-700 mb-3">Batas Waktu</h2>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Batas Waktu Dana *" value={form.batas_waktu_dana} onChange={e => set('batas_waktu_dana', e.target.value)} placeholder="Contoh: 3 Hari" />
              <Input label="Batas Akhir Pembayaran *" type="date" value={form.batas_akhir_pembayaran} onChange={e => set('batas_akhir_pembayaran', e.target.value)} />
            </div>
          </Card>
        </div>
      )}

      {/* ─── STEP 3: Review ─────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5">
            <p className="text-xs font-semibold text-amber-700">⚠ Periksa kembali semua data sebelum mengirim. Pengajuan yang sudah terkirim tidak bisa diedit.</p>
          </div>
          <Card padding={false}>
            {[
              ['Jenis', form.type], ['Pemohon', user?.name], ['Cabang', user?.cabang],
              ['Kendaraan', form.kendaraan], ['Vendor', form.vendor],
              ['Jenis Pembelian', form.jenis_pembelian],
              ...(form.npwp ? [['NPWP Vendor', form.npwp]] : []),
              ['Total Pengajuan', fmtCurrency(totalHarga)],
              ['Batas Waktu Dana', form.batas_waktu_dana],
              ['Batas Akhir Bayar', form.batas_akhir_pembayaran],
            ].map(([k,v],i,arr) => (
              <div key={k} className={`flex justify-between gap-4 px-4 py-2.5 ${i < arr.length-1 ? 'border-b border-slate-50' : ''}`}>
                <span className="text-xs text-slate-400">{k}</span>
                <span className="text-xs font-bold text-slate-700 text-right max-w-[60%]">{v}</span>
              </div>
            ))}
          </Card>
          <Card>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Tanda Tangan Digital</p>
            <p className="text-xs text-emerald-600 font-semibold">✎ Dibuat oleh: {user?.name} ({user?.jabatan})</p>
            <p className="text-xs text-slate-400 mt-1">○ Diketahui: Menunggu Verifikator</p>
            <p className="text-xs text-slate-400 mt-0.5">○ Disetujui: Menunggu Approval</p>
          </Card>
          {!navigator.onLine && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-orange-700">📴 Anda sedang offline. Pengajuan akan disimpan secara lokal dan dikirim otomatis saat koneksi kembali.</p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pb-4">
        {step > 0 && (
          <Button variant="secondary" className="flex-1" onClick={() => setStep(s => s - 1)}>← Kembali</Button>
        )}
        {step < STEPS.length - 1
          ? <Button className="flex-1" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>Lanjut →</Button>
          : <Button variant="success" className="flex-1" onClick={submit} loading={loading}>✓ Kirim Pengajuan</Button>
        }
      </div>
    </div>
  );
}
