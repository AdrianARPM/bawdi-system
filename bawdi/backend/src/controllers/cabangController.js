// src/controllers/cabangController.js — v1 (Master Data Cabang / Project)
// CRUD master cabang. Jadi satu sumber kebenaran untuk dropdown cabang di
// form pengajuan, user, dan kendaraan. Kelola hanya Admin; list terbuka
// untuk semua user login (dibutuhkan dropdown form).
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Normalisasi kode: uppercase + rapikan spasi → "apl pku" => "APLPKU"
const normKode = (k) => (k || '').trim().replace(/\s+/g, ' ').toUpperCase();

// ── GET /api/cabang?all=1 ───────────────────────────────────────
// Default: hanya cabang aktif (untuk dropdown). ?all=1 → termasuk nonaktif
// (untuk halaman kelola Admin). Menyertakan jumlah pengajuan sbg info usage.
async function list(req, res) {
  try {
    const includeInactive = req.query.all === '1' || req.query.all === 'true';

    let q = supabase.from('cabang').select('*').order('urutan').order('kode');
    if (!includeInactive) q = q.eq('is_active', true);
    const { data: rows, error } = await q;
    if (error) throw error;

    // Hitung jumlah pengajuan per kode cabang (fault-tolerant).
    const agg = {};
    try {
      const { data: subs } = await supabase.from('submissions').select('cabang');
      for (const s of subs || []) {
        const key = normKode(s.cabang);
        agg[key] = (agg[key] || 0) + 1;
      }
    } catch (e) {
      console.warn('[cabang/list] hitung pengajuan dilewati:', e.message);
    }

    res.json({
      data: (rows || []).map(c => ({ ...c, pengajuan_count: agg[c.kode] || 0 })),
    });
  } catch (err) {
    console.error('[cabang/list]', err);
    res.status(500).json({ error: 'Gagal mengambil master cabang' });
  }
}

// ── POST /api/cabang ────────────────────────────────────────────
async function create(req, res) {
  try {
    const { kode, nama, alamat, pic, telepon, urutan } = req.body;
    const clean = normKode(kode);
    if (!clean) return res.status(400).json({ error: 'Kode cabang wajib diisi' });

    const { data, error } = await supabase.from('cabang').insert({
      id: uuidv4(), kode: clean,
      nama: nama || '', alamat: alamat || '', pic: pic || '', telepon: telepon || '',
      urutan: Number.isFinite(Number(urutan)) ? Number(urutan) : 0,
    }).select().single();

    if (error) {
      if (error.code === '23505')
        return res.status(400).json({ error: `Kode cabang ${clean} sudah terdaftar` });
      throw error;
    }
    res.status(201).json({ message: 'Cabang ditambahkan', data });
  } catch (err) {
    console.error('[cabang/create]', err);
    res.status(500).json({ error: 'Gagal menambah cabang' });
  }
}

// ── PUT /api/cabang/:id ─────────────────────────────────────────
// Catatan: kode SENGAJA tidak bisa diubah dari sini — kode sudah dipakai
// sebagai string di user/kendaraan/pengajuan lama. Ubah data lain / nonaktifkan saja.
async function update(req, res) {
  try {
    const { nama, alamat, pic, telepon, urutan, is_active } = req.body;
    const patch = {};
    if (nama      !== undefined) patch.nama      = nama;
    if (alamat    !== undefined) patch.alamat    = alamat;
    if (pic       !== undefined) patch.pic       = pic;
    if (telepon   !== undefined) patch.telepon   = telepon;
    if (urutan    !== undefined) patch.urutan    = Number.isFinite(Number(urutan)) ? Number(urutan) : 0;
    if (is_active !== undefined) patch.is_active = !!is_active;

    if (!Object.keys(patch).length)
      return res.status(400).json({ error: 'Tidak ada perubahan' });

    const { data, error } = await supabase.from('cabang')
      .update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Cabang tidak ditemukan' });
    res.json({ message: 'Cabang diperbarui', data });
  } catch (err) {
    console.error('[cabang/update]', err);
    res.status(500).json({ error: 'Gagal memperbarui cabang' });
  }
}

module.exports = { list, create, update, normKode };
