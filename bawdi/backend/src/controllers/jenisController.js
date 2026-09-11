// src/controllers/jenisController.js — v1 (Master Jenis Pembelian / Beban)
// CRUD master jenis pembelian + flag pph23_wajib. Menggantikan daftar
// hardcode yg dulu tersebar di frontend & backend. Kelola hanya Admin;
// list terbuka untuk semua user login (dibutuhkan dropdown form).
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Fallback bila tabel belum dibuat (migration belum jalan) — dipakai juga
// oleh submissionController untuk validasi PPh23.
const PPH23_WAJIB_FALLBACK = [
  'Beban Perbaikan', 'Beban Perbaikan dan Suku Cadang',
  'Beban Perbaikan dan Perlengkapan Kendaraan', 'Beban Perbaikan Box',
  'Beban Perawatan', 'Beban Perawatan dan Suku Cadang', 'Beban Sewa Kendaraan',
];

const normNama = (v) => (v || '').trim().replace(/\s+/g, ' ');

// Helper dipakai controller lain: apakah jenis ini wajib PPh23?
// Aman bila tabel belum ada → fallback ke daftar lama.
async function isPph23Wajib(namaJenis) {
  const nama = normNama(namaJenis);
  if (!nama) return false;
  try {
    const { data, error } = await supabase
      .from('jenis_pembelian').select('pph23_wajib')
      .ilike('nama', nama).limit(1).maybeSingle();
    if (error) throw error;
    if (data) return !!data.pph23_wajib;         // ada di master → pakai aturan master
    return false;                                 // ada master tapi jenis tak terdaftar → tidak wajib
  } catch (e) {
    console.warn('[jenis/isPph23Wajib] fallback ke daftar lama:', e.message);
    return PPH23_WAJIB_FALLBACK.includes(nama);
  }
}

// ── GET /api/jenis?all=1 ────────────────────────────────────────
async function list(req, res) {
  try {
    const includeInactive = req.query.all === '1' || req.query.all === 'true';
    let q = supabase.from('jenis_pembelian').select('*').order('urutan').order('nama');
    if (!includeInactive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('[jenis/list]', err);
    res.status(500).json({ error: 'Gagal mengambil master jenis pembelian' });
  }
}

// ── POST /api/jenis ─────────────────────────────────────────────
async function create(req, res) {
  try {
    const nama = normNama(req.body.nama);
    if (!nama) return res.status(400).json({ error: 'Nama jenis wajib diisi' });
    const { for_kendaraan, for_umum, pph23_wajib, urutan } = req.body;
    if (!for_kendaraan && !for_umum)
      return res.status(400).json({ error: 'Pilih minimal satu konteks: Kendaraan atau Umum' });

    const { data, error } = await supabase.from('jenis_pembelian').insert({
      id: uuidv4(), nama,
      for_kendaraan: !!for_kendaraan, for_umum: !!for_umum, pph23_wajib: !!pph23_wajib,
      urutan: Number.isFinite(Number(urutan)) ? Number(urutan) : 0,
    }).select().single();

    if (error) {
      if (error.code === '23505')
        return res.status(400).json({ error: `Jenis "${nama}" sudah terdaftar` });
      throw error;
    }
    res.status(201).json({ message: 'Jenis pembelian ditambahkan', data });
  } catch (err) {
    console.error('[jenis/create]', err);
    res.status(500).json({ error: 'Gagal menambah jenis pembelian' });
  }
}

// ── PUT /api/jenis/:id ──────────────────────────────────────────
async function update(req, res) {
  try {
    const { nama, for_kendaraan, for_umum, pph23_wajib, urutan, is_active } = req.body;
    const patch = {};
    if (nama          !== undefined) { const n = normNama(nama); if (!n) return res.status(400).json({ error: 'Nama tidak boleh kosong' }); patch.nama = n; }
    if (for_kendaraan !== undefined) patch.for_kendaraan = !!for_kendaraan;
    if (for_umum      !== undefined) patch.for_umum      = !!for_umum;
    if (pph23_wajib   !== undefined) patch.pph23_wajib   = !!pph23_wajib;
    if (urutan        !== undefined) patch.urutan        = Number.isFinite(Number(urutan)) ? Number(urutan) : 0;
    if (is_active     !== undefined) patch.is_active     = !!is_active;

    if (!Object.keys(patch).length)
      return res.status(400).json({ error: 'Tidak ada perubahan' });

    const { data, error } = await supabase.from('jenis_pembelian')
      .update(patch).eq('id', req.params.id).select().single();
    if (error) {
      if (error.code === '23505')
        return res.status(400).json({ error: `Nama "${patch.nama}" sudah dipakai jenis lain` });
      throw error;
    }
    if (!data) return res.status(404).json({ error: 'Jenis tidak ditemukan' });
    res.json({ message: 'Jenis pembelian diperbarui', data });
  } catch (err) {
    console.error('[jenis/update]', err);
    res.status(500).json({ error: 'Gagal memperbarui jenis pembelian' });
  }
}

module.exports = { list, create, update, isPph23Wajib, PPH23_WAJIB_FALLBACK };
