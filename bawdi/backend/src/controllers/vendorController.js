// src/controllers/vendorController.js — v1 (Master Data Vendor / Supplier)
// CRUD master vendor. Jadi sumber tunggal nama + NPWP + rekening, supaya
// tidak diketik ulang tiap pengajuan. Kelola hanya Admin; list terbuka
// untuk semua user login (dibutuhkan autofill di form pengajuan).
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

const clean = (v) => (v || '').trim();
const normNama = (v) => clean(v).replace(/\s+/g, ' ');

// Susun string rekening siap-pakai untuk field "Rekening Tujuan" di form.
function composeRekening(v) {
  if (v.bank && v.no_rekening)
    return `${v.bank} — ${v.no_rekening}${v.atas_nama ? ` a/n ${v.atas_nama}` : ''}`;
  return v.no_rekening || '';
}

// ── GET /api/vendors?all=1 ──────────────────────────────────────
// Default: hanya vendor aktif (untuk dropdown/autofill). ?all=1 → termasuk
// nonaktif (untuk halaman kelola Admin). Menyertakan jumlah pengajuan.
async function list(req, res) {
  try {
    const includeInactive = req.query.all === '1' || req.query.all === 'true';

    let q = supabase.from('vendors').select('*').order('nama');
    if (!includeInactive) q = q.eq('is_active', true);
    const { data: rows, error } = await q;
    if (error) throw error;

    // Hitung jumlah pengajuan per nama vendor (case-insensitive, fault-tolerant).
    const agg = {};
    try {
      const { data: subs } = await supabase.from('submissions').select('vendor');
      for (const s of subs || []) {
        const key = normNama(s.vendor).toLowerCase();
        if (key) agg[key] = (agg[key] || 0) + 1;
      }
    } catch (e) {
      console.warn('[vendors/list] hitung pengajuan dilewati:', e.message);
    }

    res.json({
      data: (rows || []).map(v => ({
        ...v,
        rekening: composeRekening(v),
        pengajuan_count: agg[normNama(v.nama).toLowerCase()] || 0,
      })),
    });
  } catch (err) {
    console.error('[vendors/list]', err);
    res.status(500).json({ error: 'Gagal mengambil master vendor' });
  }
}

// ── POST /api/vendors ───────────────────────────────────────────
async function create(req, res) {
  try {
    const nama = normNama(req.body.nama);
    if (!nama) return res.status(400).json({ error: 'Nama vendor wajib diisi' });

    const { data, error } = await supabase.from('vendors').insert({
      id: uuidv4(), nama,
      npwp:        clean(req.body.npwp),
      bank:        clean(req.body.bank),
      no_rekening: clean(req.body.no_rekening),
      atas_nama:   clean(req.body.atas_nama),
      telepon:     clean(req.body.telepon),
      alamat:      clean(req.body.alamat),
    }).select().single();

    if (error) {
      if (error.code === '23505')
        return res.status(400).json({ error: `Vendor "${nama}" sudah terdaftar` });
      throw error;
    }
    res.status(201).json({ message: 'Vendor ditambahkan', data });
  } catch (err) {
    console.error('[vendors/create]', err);
    res.status(500).json({ error: 'Gagal menambah vendor' });
  }
}

// ── PUT /api/vendors/:id ────────────────────────────────────────
async function update(req, res) {
  try {
    const { nama, npwp, bank, no_rekening, atas_nama, telepon, alamat, is_active } = req.body;
    const patch = {};
    if (nama        !== undefined) { const n = normNama(nama); if (!n) return res.status(400).json({ error: 'Nama vendor tidak boleh kosong' }); patch.nama = n; }
    if (npwp        !== undefined) patch.npwp        = clean(npwp);
    if (bank        !== undefined) patch.bank        = clean(bank);
    if (no_rekening !== undefined) patch.no_rekening = clean(no_rekening);
    if (atas_nama   !== undefined) patch.atas_nama   = clean(atas_nama);
    if (telepon     !== undefined) patch.telepon     = clean(telepon);
    if (alamat      !== undefined) patch.alamat      = clean(alamat);
    if (is_active   !== undefined) patch.is_active   = !!is_active;

    if (!Object.keys(patch).length)
      return res.status(400).json({ error: 'Tidak ada perubahan' });

    const { data, error } = await supabase.from('vendors')
      .update(patch).eq('id', req.params.id).select().single();
    if (error) {
      if (error.code === '23505')
        return res.status(400).json({ error: `Nama vendor "${patch.nama}" sudah dipakai vendor lain` });
      throw error;
    }
    if (!data) return res.status(404).json({ error: 'Vendor tidak ditemukan' });
    res.json({ message: 'Vendor diperbarui', data });
  } catch (err) {
    console.error('[vendors/update]', err);
    res.status(500).json({ error: 'Gagal memperbarui vendor' });
  }
}

module.exports = { list, create, update, composeRekening };
