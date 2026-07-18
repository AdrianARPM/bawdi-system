// src/components/RevisiEditor.jsx  — Dark Mode Tahap 4: hanya penambahan varian dark:, tanpa perubahan fitur (basis: BUGFIX item form focus loss)
// v11: form revisi kini membawa km_pengajuan & kategori_biaya per item
//      agar tidak hilang saat pengajuan direvisi.
// Fix: stable key untuk item rows, hapus onInput auto-resize yang menyebabkan re-render
import { useState, useCallback } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { revisionAPI, historyAPI } from '../utils/api';
import { Button, fmtCurrency } from './ui';

// Format helper — disamakan dgn NewFormPage agar riwayat konsisten
function fmtKM(km) {
  if (km == null || km === '') return '—';
  return Number(km).toLocaleString('id-ID') + ' KM';
}
function fmtTanggal(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ── Item Row — FIXED: tidak kehilangan fokus saat mengetik ─────
   Root cause sebelumnya:
   1. onInput auto-resize memicu style change → re-render → focus loss
   2. key menggunakan _idx dari filter → tidak stabil saat list berubah
   Fix: gunakan item.id sebagai key, hapus onInput, pakai min-h tetap
─────────────────────────────────────────────────────────────── */
const KATEGORI_BIAYA = ['Sewa', 'Service', 'Ban', 'Izin Kendaraan', 'Jasa', 'Lainnya'];

// Selisih KM dgn koreksi odometer rollover (disamakan dgn NewFormPage.hitungSelisihKM)
function hitungSelisihKM(kmSekarang, kmTerakhir) {
  if (!kmSekarang || kmTerakhir == null) return null;
  const raw = kmSekarang - kmTerakhir;
  if (raw >= 0) return raw;
  const batas = kmTerakhir > 99999 ? 999999 : 99999;
  return (batas - kmTerakhir) + kmSekarang;
}

function ItemRow({ item, onUpdate, onRemove, canRemove, vendorLabel, vendorColor, isUmum }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2 bg-white dark:bg-slate-900">
      <div className="flex justify-between items-center">
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${vendorColor}`}>
          {vendorLabel}
        </span>
        {canRemove && (
          <button
            type="button"
            onMouseDown={e => e.preventDefault()} // ← mencegah blur sebelum klik
            onClick={onRemove}
            className="text-red-400 hover:text-red-600 dark:hover:text-red-400 p-1">
            <Trash2 size={13}/>
          </button>
        )}
      </div>

      {/* Penjelasan — textarea dengan min-height tetap, TANPA onInput */}
      <textarea
        value={item.penjelasan}
        onChange={e => onUpdate('penjelasan', e.target.value)}
        rows={2}
        placeholder="Penjelasan item: nama barang, merek, ukuran, kondisi..."
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 text-sm text-slate-800 dark:text-slate-100
                   outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20
                   resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600 leading-relaxed transition-colors"
      />

      {/* Satuan + Harga dalam satu baris */}
      <div className="grid grid-cols-5 gap-2">
        <input
          value={item.satuan}
          onChange={e => onUpdate('satuan', e.target.value)}
          placeholder="Satuan"
          className="col-span-2 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 text-sm text-slate-800 dark:text-slate-100
                     outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20
                     placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-colors"
        />
        <div className="col-span-3 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500 pointer-events-none">Rp</span>
          <input
            type="number"
            value={item.harga}
            onChange={e => onUpdate('harga', e.target.value)}
            placeholder="0"
            className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 text-sm text-slate-800 dark:text-slate-100
                       outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20
                       placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-colors"
          />
        </div>
      </div>

      {/* Diskon per item (opsional) */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-rose-400 pointer-events-none">Diskon Rp</span>
        <input
          type="number"
          value={item.diskon || ''}
          onChange={e => onUpdate('diskon', e.target.value)}
          placeholder="0"
          className="w-full pl-16 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 text-sm text-slate-800 dark:text-slate-100
                     outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20
                     placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-colors"
        />
      </div>

      {/* v11: Kategori biaya + KM saat pengajuan (per item) — tidak relevan utk pengajuan umum */}
      {!isUmum && (
      <div className="grid grid-cols-5 gap-2">
        <select
          value={item.kategori_biaya || ''}
          onChange={e => onUpdate('kategori_biaya', e.target.value)}
          className={`col-span-3 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 ${item.kategori_biaya ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>
          <option value="">— Kategori biaya —</option>
          {KATEGORI_BIAYA.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <input
          type="number"
          value={item.km_pengajuan || ''}
          onChange={e => onUpdate('km_pengajuan', e.target.value)}
          placeholder="KM"
          className="col-span-2 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 placeholder:text-slate-300 dark:placeholder:text-slate-600"
        />
      </div>
      )}

      {item.harga > 0 && (() => {
        const gross = (parseFloat(item.satuan) || 1) * (parseFloat(item.harga) || 0);
        const net   = Math.max(0, gross - (parseFloat(item.diskon) || 0));
        return (
          <p className="text-xs font-semibold text-right">
            {Number(item.diskon) > 0 && (
              <span className="text-slate-400 dark:text-slate-500 mr-1.5">{fmtCurrency(gross)} − {fmtCurrency(parseFloat(item.diskon) || 0)} =</span>
            )}
            <span className="text-amber-500">{fmtCurrency(net)}</span>
          </p>
        );
      })()}
    </div>
  );
}

/* ── Items Section per vendor ────────────────────────────────── */
function ItemsSection({ items, vendorNum, vendorLabel, vendorColor, onUpdate, onAdd, onRemove, isUmum }) {
  const vendorItems = items
    .map((it, i) => ({ ...it, _globalIdx: i }))
    .filter(it => it.vendor_num === vendorNum);

  const total = vendorItems.reduce((s, it) => {
    const gross = (parseFloat(it.satuan) || 1) * (parseFloat(it.harga) || 0);
    return s + Math.max(0, gross - (parseFloat(it.diskon) || 0));
  }, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-600 dark:text-slate-300">{vendorLabel}</p>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => onAdd(vendorNum)}
          className="flex items-center gap-1 text-[10px] font-bold text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
          <Plus size={11}/> Tambah Item
        </button>
      </div>

      {vendorItems.map(it => (
        <ItemRow
          isUmum={isUmum}
          key={it.id || `item-${it._globalIdx}`}  /* ← stable key */
          item={it}
          vendorLabel={vendorLabel}
          vendorColor={vendorColor}
          canRemove={vendorItems.length > 1 || vendorNum === 2}
          onUpdate={(field, val) => onUpdate(it._globalIdx, field, val)}
          onRemove={() => onRemove(it._globalIdx)}
        />
      ))}

      <div className="flex justify-between items-center bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2 mt-1">
        <span className="text-xs font-bold text-amber-800 dark:text-amber-300">Total {vendorLabel}</span>
        <span className="text-sm font-black text-amber-500">{fmtCurrency(total)}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function RevisiEditor({ snapshot, onClose, onSubmitted, isUmum = false, kendaraan = '' }) {
  const [form, setForm] = useState({
    alasan:          snapshot.alasan          || '',
    riwayat:         snapshot.riwayat         || '',
    vendor:          snapshot.vendor          || '',
    npwp:            snapshot.npwp            || '',
    vendor2:         snapshot.vendor2         || '',
    npwp2:           snapshot.npwp2           || '',
    rekening_tujuan: snapshot.rekening_tujuan || '',
    ppn:             snapshot.ppn != null && snapshot.ppn !== '' ? String(snapshot.ppn) : '',
    pph23:           snapshot.pph23 || '',
    // Gunakan id asli dari database sebagai key yang stabil
    items: (snapshot.items || []).map(i => ({
      id:            i.id || `new-${Date.now()}-${Math.random()}`,
      penjelasan:    i.penjelasan || '',
      satuan:        i.satuan     || '',
      harga:         String(i.harga || ''),
      diskon:        i.diskon ? String(i.diskon) : '',
      vendor_num:    i.vendor_num || 1,
      km_pengajuan:  i.km_pengajuan != null ? String(i.km_pengajuan) : '',
      kategori_biaya: i.kategori_biaya || 'Lainnya',
    })),
  });

  const [saving,     setSaving]     = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const setField = useCallback((k, v) => setForm(f => ({ ...f, [k]: v })), []);

  // Susun teks Riwayat otomatis dari item — format PERSIS seperti pengajuan asli (NewFormPage.buildRiwayat)
  const [buildingRiwayat, setBuildingRiwayat] = useState(false);
  const susunRiwayat = useCallback(async () => {
    if (buildingRiwayat) return;
    // Jaring pengaman: jika Riwayat sudah ada isinya (mis. hasil suntingan manual),
    // konfirmasi dulu sebelum menulis ulang seluruhnya.
    const isiSekarang = (form.riwayat || '').trim();
    if (isiSekarang && isiSekarang !== '(Tidak ada riwayat KM yang diisi)') {
      if (!window.confirm('Kotak Riwayat sudah berisi teks. Menyusun otomatis akan menulis ulang SELURUH isinya (termasuk suntingan manual). Lanjutkan?')) {
        return;
      }
    }
    setBuildingRiwayat(true);
    try {
      const ordered = [
        ...form.items.filter(i => i.vendor_num !== 2),
        ...form.items.filter(i => i.vendor_num === 2),
      ];
      // Cari KM/Tgl terakhir dari arsip per item (paralel), berdasarkan plat + nama item
      const results = await Promise.all(ordered.map(async item => {
        let arsip = null;
        const keyword = item.penjelasan?.trim();
        if (kendaraan?.trim() && keyword) {
          try {
            const { data: res } = await historyAPI.getLastKM(kendaraan.trim(), keyword);
            if (res?.data) arsip = res.data;
          } catch { /* abaikan — arsip tak ada */ }
        }
        return { item, arsip };
      }));

      const lines = [];
      let counter = 0;
      results.forEach(({ item, arsip }) => {
        const hasArsip      = !!arsip;
        const kmTerakhirEf  = hasArsip ? arsip.km_pengajuan : null;
        const tglTerakhirEf = hasArsip ? arsip.tanggal      : null;
        const kmSekarang    = parseInt(item.km_pengajuan) || null;
        if (!kmSekarang && !kmTerakhirEf && !tglTerakhirEf) return;  // item tanpa data KM dilewati
        counter++;
        const selisih = hitungSelisihKM(kmSekarang, kmTerakhirEf);
        const sumber  = hasArsip ? (arsip.nomor_pengajuan ? ` (${arsip.nomor_pengajuan})` : '') : '';
        lines.push(`${counter}. ${item.penjelasan || '(tanpa penjelasan)'}`);
        lines.push(`   a. Tgl Terakhir : ${tglTerakhirEf ? fmtTanggal(tglTerakhirEf) + sumber : '—'}`);
        lines.push(`   b. KM Terakhir  : ${kmTerakhirEf != null ? fmtKM(kmTerakhirEf) : '—'}`);
        lines.push(`   c. KM Sekarang  : ${kmSekarang != null ? fmtKM(kmSekarang) : '—'}`);
        lines.push(`   d. Selisih KM   : ${selisih != null ? `${selisih >= 0 ? '+' : ''}${selisih.toLocaleString('id-ID')} KM` : '—'}`);
        lines.push('');
      });
      setField('riwayat', lines.length ? lines.join('\n').trim() : '(Tidak ada riwayat KM yang diisi)');
      toast.success('Riwayat disusun otomatis dari data item');
    } catch {
      toast.error('Gagal menyusun riwayat');
    } finally {
      setBuildingRiwayat(false);
    }
  }, [form.items, form.riwayat, kendaraan, buildingRiwayat, setField]);

  // Update item by global index — menggunakan functional update untuk stabilitas
  const updateItem = useCallback((globalIdx, field, value) => {
    setForm(f => ({
      ...f,
      items: f.items.map((it, i) => i === globalIdx ? { ...it, [field]: value } : it),
    }));
  }, []);

  const addItem = useCallback((vendorNum) => {
    setForm(f => ({
      ...f,
      items: [...f.items, {
        id:            `new-${Date.now()}-${Math.random()}`,
        penjelasan:    '',
        satuan:        '',
        harga:         '',
        diskon:        '',
        vendor_num:    vendorNum,
        km_pengajuan:  '',
        kategori_biaya: 'Lainnya',
      }],
    }));
  }, []);

  const removeItem = useCallback((globalIdx) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== globalIdx) }));
  }, []);

  const hasVendor2 = form.items.some(i => i.vendor_num === 2);

  const handleSave = async () => {
    setSaving(true);
    try {
      await revisionAPI.editSnapshot(snapshot.id, form);
      toast.success('Draft revisi tersimpan');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan');
    }
    setSaving(false);
  };

  const handleSubmit = async () => {
    if (!form.alasan.trim()) { toast.error('Alasan wajib diisi'); return; }
    if (!form.vendor.trim()) { toast.error('Vendor wajib diisi'); return; }
    const items1 = form.items.filter(i => i.vendor_num !== 2);
    if (items1.length === 0) { toast.error('Minimal 1 item vendor 1 wajib ada'); return; }
    const emptyItem = form.items.find(i => !i.penjelasan.trim() || !i.harga);
    if (emptyItem) { toast.error('Semua item harus diisi lengkap (penjelasan & harga)'); return; }

    setSubmitting(true);
    try {
      await revisionAPI.editSnapshot(snapshot.id, form);
      await revisionAPI.submitSnapshot(snapshot.id);
      toast.success('Revisi berhasil dikirim!');
      onSubmitted();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal mengirim revisi');
    }
    setSubmitting(false);
  };

  const inputCls = `w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 dark:bg-slate-900
                    outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20
                    transition-colors placeholder:text-slate-300 dark:placeholder:text-slate-600`;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
      <div className="min-h-screen p-4 flex items-start justify-center">
        <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl my-4">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 rounded-t-2xl z-10">
            <div>
              <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
                Edit Revisi ke-{snapshot.revision_number}
              </h3>
              {snapshot.alasan_revisi && (
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5 font-medium">
                  📋 {snapshot.alasan_revisi}
                </p>
              )}
            </div>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={onClose}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <X size={16} className="text-slate-500 dark:text-slate-400"/>
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">

            {/* Alasan */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                Alasan Pengajuan <span className="text-red-500">*</span>
              </label>
              <textarea
                value={form.alasan}
                onChange={e => setField('alasan', e.target.value)}
                rows={3}
                className={inputCls + ' resize-none'}
                placeholder="Jelaskan alasan pengajuan..."/>
            </div>

            {/* Riwayat */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Riwayat</label>
                {!isUmum && (
                  <button type="button" onClick={susunRiwayat} disabled={buildingRiwayat}
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50">
                    {buildingRiwayat ? 'Menyusun…' : '↻ Susun Riwayat Otomatis'}
                  </button>
                )}
              </div>
              <textarea
                value={form.riwayat}
                onChange={e => setField('riwayat', e.target.value)}
                rows={4}
                className={inputCls + ' resize-none leading-relaxed'}
                placeholder="Riwayat service/penggantian sebelumnya..."/>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                {isUmum ? '💡 Tekan Enter untuk baris baru'
                        : '💡 Isi KM Sekarang tiap item, lalu klik "Susun Riwayat Otomatis" agar formatnya sama persis dengan pengajuan asli — atau ketik manual.'}
              </p>
            </div>

            {/* Ppn & Pph23 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Ppn (Rp)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500 pointer-events-none">Rp</span>
                  <input
                    type="number"
                    value={form.ppn}
                    onChange={e => setField('ppn', e.target.value)}
                    placeholder="0"
                    className={inputCls + ' pl-8'}/>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Menambah total. Kosongkan jika tidak ada.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Pph23 (keterangan)</label>
                <textarea
                  value={form.pph23}
                  onChange={e => setField('pph23', e.target.value)}
                  rows={2}
                  className={inputCls + ' resize-none leading-relaxed'}
                  placeholder="Contoh: Rp 1.695.330 × 2% = Rp 33.907"/>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Informatif — tidak mengubah total.</p>
              </div>
            </div>

            {/* Vendor 1 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                  Vendor 1 <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.vendor}
                  onChange={e => setField('vendor', e.target.value)}
                  className={inputCls}
                  placeholder="Nama vendor/bengkel"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">NPWP Vendor 1</label>
                <input
                  value={form.npwp}
                  onChange={e => setField('npwp', e.target.value)}
                  className={inputCls}
                  placeholder="Opsional"/>
              </div>
            </div>

            {/* Rekening */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Rekening Tujuan Pembayaran</label>
              <textarea
                value={form.rekening_tujuan}
                onChange={e => setField('rekening_tujuan', e.target.value)}
                rows={2}
                className={inputCls + ' resize-none'}
                placeholder="Bank — Nomor Rekening a/n Nama Pemilik"/>
            </div>

            {/* Items Vendor 1 */}
            <ItemsSection
              isUmum={isUmum}
              items={form.items}
              vendorNum={1}
              vendorLabel="Vendor 1"
              vendorColor="bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
              onUpdate={updateItem}
              onAdd={addItem}
              onRemove={removeItem}
            />

            {/* Vendor 2 jika ada */}
            {hasVendor2 && (
              <>
                <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Vendor 2</label>
                      <input
                        value={form.vendor2}
                        onChange={e => setField('vendor2', e.target.value)}
                        className={inputCls}
                        placeholder="Nama vendor 2"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">NPWP Vendor 2</label>
                      <input
                        value={form.npwp2}
                        onChange={e => setField('npwp2', e.target.value)}
                        className={inputCls}
                        placeholder="Opsional"/>
                    </div>
                  </div>
                  <ItemsSection
                    isUmum={isUmum}
                    items={form.items}
                    vendorNum={2}
                    vendorLabel="Vendor 2"
                    vendorColor="bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400"
                    onUpdate={updateItem}
                    onAdd={addItem}
                    onRemove={removeItem}
                  />
                </div>
              </>
            )}
          </div>

          {/* Footer actions */}
          <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex gap-2.5 sticky bottom-0 bg-white dark:bg-slate-900 rounded-b-2xl">
            <Button variant="secondary" className="flex-1" onClick={handleSave} loading={saving}>
              💾 Simpan Draft
            </Button>
            <Button variant="success" className="flex-1" onClick={handleSubmit} loading={submitting}>
              ✓ Kirim Revisi
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
