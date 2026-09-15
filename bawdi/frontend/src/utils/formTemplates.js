// src/utils/formTemplates.js — template pengajuan tersimpan di localStorage (per browser).
// Menyimpan field yang berguna diulang (vendor, jenis, item, harga, alasan);
// field sesaat (nomor urut, KM, tanggal batas, foto) TIDAK ikut disimpan.
const KEY = 'bawdi_form_templates';

export function getTemplates() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}

function persist(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* kuota penuh / private mode */ }
}

// Ambil hanya field yang layak disimpan dari state form.
export function snapshotForm(form) {
  const item = (it) => ({
    penjelasan: it.penjelasan || '',
    satuan: it.satuan || '',
    harga: String(it.harga ?? ''),
    diskon: String(it.diskon ?? ''),
    kategori_biaya: it.kategori_biaya || '',
  });
  return {
    type: form.type || 'PR',
    is_umum: !!form.is_umum,
    jenis_pembelian: form.jenis_pembelian || '',
    vendor: form.vendor || '', npwp: form.npwp || '', rekening_tujuan: form.rekening_tujuan || '',
    items1: (form.items1 || []).map(item),
    useVendor2: !!form.useVendor2,
    vendor2: form.vendor2 || '', npwp2: form.npwp2 || '', rekening_tujuan2: form.rekening_tujuan2 || '',
    items2: (form.items2 || []).map(item),
    alasan: form.alasan || '', alasan_type: form.alasan_type || '',
    ppn: form.ppn ? String(form.ppn) : '', pph23: form.pph23 || '',
  };
}

export function saveTemplate(nama, form) {
  const list = getTemplates();
  const tpl = {
    id: (crypto?.randomUUID?.() || String(Date.now())),
    nama: (nama || 'Template').trim().slice(0, 40),
    created_at: new Date().toISOString(),
    data: snapshotForm(form),
  };
  list.unshift(tpl);
  persist(list.slice(0, 30)); // batasi 30 template
  return tpl;
}

export function removeTemplate(id) {
  persist(getTemplates().filter(t => t.id !== id));
}
