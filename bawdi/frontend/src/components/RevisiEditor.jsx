// src/components/RevisiEditor.jsx  — BUGFIX item form focus loss
// Fix: stable key untuk item rows, hapus onInput auto-resize yang menyebabkan re-render
import { useState, useCallback } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { revisionAPI } from '../utils/api';
import { Button, fmtCurrency } from './ui';

/* ── Item Row — FIXED: tidak kehilangan fokus saat mengetik ─────
   Root cause sebelumnya:
   1. onInput auto-resize memicu style change → re-render → focus loss
   2. key menggunakan _idx dari filter → tidak stabil saat list berubah
   Fix: gunakan item.id sebagai key, hapus onInput, pakai min-h tetap
─────────────────────────────────────────────────────────────── */
function ItemRow({ item, onUpdate, onRemove, canRemove, vendorLabel, vendorColor }) {
  return (
    <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-white">
      <div className="flex justify-between items-center">
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${vendorColor}`}>
          {vendorLabel}
        </span>
        {canRemove && (
          <button
            type="button"
            onMouseDown={e => e.preventDefault()} // ← mencegah blur sebelum klik
            onClick={onRemove}
            className="text-red-400 hover:text-red-600 p-1">
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
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800
                   outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100
                   resize-none placeholder:text-slate-300 leading-relaxed transition-colors"
      />

      {/* Satuan + Harga dalam satu baris */}
      <div className="grid grid-cols-5 gap-2">
        <input
          value={item.satuan}
          onChange={e => onUpdate('satuan', e.target.value)}
          placeholder="Satuan"
          className="col-span-2 px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800
                     outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100
                     placeholder:text-slate-300 transition-colors"
        />
        <div className="col-span-3 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">Rp</span>
          <input
            type="number"
            value={item.harga}
            onChange={e => onUpdate('harga', e.target.value)}
            placeholder="0"
            className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800
                       outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100
                       placeholder:text-slate-300 transition-colors"
          />
        </div>
      </div>

      {item.harga > 0 && (
        <p className="text-xs text-amber-500 font-semibold text-right">
          {fmtCurrency(parseFloat(item.harga) || 0)}
        </p>
      )}
    </div>
  );
}

/* ── Items Section per vendor ────────────────────────────────── */
function ItemsSection({ items, vendorNum, vendorLabel, vendorColor, onUpdate, onAdd, onRemove }) {
  const vendorItems = items
    .map((it, i) => ({ ...it, _globalIdx: i }))
    .filter(it => it.vendor_num === vendorNum);

  const total = vendorItems.reduce((s, it) => s + (parseFloat(it.harga) || 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-600">{vendorLabel}</p>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => onAdd(vendorNum)}
          className="flex items-center gap-1 text-[10px] font-bold text-amber-500 hover:text-amber-600 transition-colors">
          <Plus size={11}/> Tambah Item
        </button>
      </div>

      {vendorItems.map(it => (
        <ItemRow
          key={it.id || `item-${it._globalIdx}`}  /* ← stable key */
          item={it}
          vendorLabel={vendorLabel}
          vendorColor={vendorColor}
          canRemove={vendorItems.length > 1 || vendorNum === 2}
          onUpdate={(field, val) => onUpdate(it._globalIdx, field, val)}
          onRemove={() => onRemove(it._globalIdx)}
        />
      ))}

      <div className="flex justify-between items-center bg-amber-50 rounded-xl px-3 py-2 mt-1">
        <span className="text-xs font-bold text-amber-800">Total {vendorLabel}</span>
        <span className="text-sm font-black text-amber-500">{fmtCurrency(total)}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function RevisiEditor({ snapshot, onClose, onSubmitted }) {
  const [form, setForm] = useState({
    alasan:          snapshot.alasan          || '',
    riwayat:         snapshot.riwayat         || '',
    vendor:          snapshot.vendor          || '',
    npwp:            snapshot.npwp            || '',
    vendor2:         snapshot.vendor2         || '',
    npwp2:           snapshot.npwp2           || '',
    rekening_tujuan: snapshot.rekening_tujuan || '',
    // Gunakan id asli dari database sebagai key yang stabil
    items: (snapshot.items || []).map(i => ({
      id:         i.id || `new-${Date.now()}-${Math.random()}`,
      penjelasan: i.penjelasan || '',
      satuan:     i.satuan     || '',
      harga:      String(i.harga || ''),
      vendor_num: i.vendor_num || 1,
    })),
  });

  const [saving,     setSaving]     = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const setField = useCallback((k, v) => setForm(f => ({ ...f, [k]: v })), []);

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
        id:         `new-${Date.now()}-${Math.random()}`,
        penjelasan: '',
        satuan:     '',
        harga:      '',
        vendor_num: vendorNum,
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

  const inputCls = `w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800
                    outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100
                    transition-colors placeholder:text-slate-300`;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
      <div className="min-h-screen p-4 flex items-start justify-center">
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-4">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
            <div>
              <h3 className="text-base font-black text-slate-800">
                Edit Revisi ke-{snapshot.revision_number}
              </h3>
              {snapshot.alasan_revisi && (
                <p className="text-xs text-purple-600 mt-0.5 font-medium">
                  📋 {snapshot.alasan_revisi}
                </p>
              )}
            </div>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={onClose}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
              <X size={16} className="text-slate-500"/>
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">

            {/* Alasan */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
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
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Riwayat</label>
              <textarea
                value={form.riwayat}
                onChange={e => setField('riwayat', e.target.value)}
                rows={4}
                className={inputCls + ' resize-none leading-relaxed'}
                placeholder="Riwayat service/penggantian sebelumnya..."/>
              <p className="text-[10px] text-slate-400 mt-1">💡 Tekan Enter untuk baris baru</p>
            </div>

            {/* Vendor 1 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Vendor 1 <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.vendor}
                  onChange={e => setField('vendor', e.target.value)}
                  className={inputCls}
                  placeholder="Nama vendor/bengkel"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">NPWP Vendor 1</label>
                <input
                  value={form.npwp}
                  onChange={e => setField('npwp', e.target.value)}
                  className={inputCls}
                  placeholder="Opsional"/>
              </div>
            </div>

            {/* Rekening */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Rekening Tujuan Pembayaran</label>
              <textarea
                value={form.rekening_tujuan}
                onChange={e => setField('rekening_tujuan', e.target.value)}
                rows={2}
                className={inputCls + ' resize-none'}
                placeholder="Bank — Nomor Rekening a/n Nama Pemilik"/>
            </div>

            {/* Items Vendor 1 */}
            <ItemsSection
              items={form.items}
              vendorNum={1}
              vendorLabel="Vendor 1"
              vendorColor="bg-blue-100 text-blue-600"
              onUpdate={updateItem}
              onAdd={addItem}
              onRemove={removeItem}
            />

            {/* Vendor 2 jika ada */}
            {hasVendor2 && (
              <>
                <div className="border-t border-slate-100 pt-3">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">Vendor 2</label>
                      <input
                        value={form.vendor2}
                        onChange={e => setField('vendor2', e.target.value)}
                        className={inputCls}
                        placeholder="Nama vendor 2"/>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">NPWP Vendor 2</label>
                      <input
                        value={form.npwp2}
                        onChange={e => setField('npwp2', e.target.value)}
                        className={inputCls}
                        placeholder="Opsional"/>
                    </div>
                  </div>
                  <ItemsSection
                    items={form.items}
                    vendorNum={2}
                    vendorLabel="Vendor 2"
                    vendorColor="bg-orange-100 text-orange-600"
                    onUpdate={updateItem}
                    onAdd={addItem}
                    onRemove={removeItem}
                  />
                </div>
              </>
            )}
          </div>

          {/* Footer actions */}
          <div className="px-5 py-4 border-t border-slate-100 flex gap-2.5 sticky bottom-0 bg-white rounded-b-2xl">
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
