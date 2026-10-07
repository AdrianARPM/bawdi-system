// src/controllers/masterItemController.js — v1 (Katalog Master Item)
// Item dasar untuk form pengajuan + penyambung riwayat. Scope: global (Admin)
// & per-cabang (Operasional). Operasional hanya kelola item cabangnya sendiri.
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

const KATEGORI    = ['Sewa', 'Service', 'Ban', 'Izin Kendaraan', 'Jasa', 'Lainnya'];
const JENIS_KEND  = ['motor', 'mobil', 'umum'];
const normNama = (v) => (v || '').trim().replace(/\s+/g, ' ');
const myCabang = (req) => (req.user?.cabang || '').trim();
const normPlat = (p) => (p || '').trim().replace(/\s+/g, ' ').toUpperCase();

// Selaras dengan historyController: kurung posisi/varian dipertahankan, kurung
// merek/catatan dibuang. displayBase menjaga huruf asli; baseKey untuk grouping.
const VARIAN_RE = /\b(depan|belakang|kanan|kiri|atas|bawah|luar|dalam|muka|besar|kecil)\b/i;
const displayBase = (text) => String(text || '')
  .replace(/\(([^)]*)\)/g, (_, inner) => VARIAN_RE.test(inner) ? ` (${inner.trim()}) ` : ' ')
  .replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
const baseKey = (text) => displayBase(text).toLowerCase();

// ── GET /api/master-item?all=1&jenis=motor|mobil ────────────────
// Default: item aktif, terlihat oleh user (global + cabangnya).
// ?all=1 → termasuk nonaktif (untuk halaman kelola).
async function list(req, res) {
  try {
    const includeInactive = req.query.all === '1' || req.query.all === 'true';
    const jenis = JENIS_KEND.includes(req.query.jenis) ? req.query.jenis : null;

    let q = supabase.from('master_item').select('*').order('nama');
    if (!includeInactive) q = q.eq('is_active', true);
    if (jenis) q = q.in('jenis_kendaraan', [jenis, 'umum']); // 'umum' selalu relevan

    // Visibilitas: Admin lihat semua; lainnya lihat global (NULL) + cabangnya.
    if (req.user.role !== 'Admin') {
      const cab = myCabang(req);
      q = cab ? q.or(`cabang.is.null,cabang.eq.${cab}`) : q.is('cabang', null);
    }

    const { data, error } = await q;
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('[master-item/list]', err);
    res.status(500).json({ error: 'Gagal mengambil master item' });
  }
}

// ── POST /api/master-item ───────────────────────────────────────
async function create(req, res) {
  try {
    const nama = normNama(req.body.nama);
    if (!nama) return res.status(400).json({ error: 'Nama item wajib diisi' });
    const jenis    = JENIS_KEND.includes(req.body.jenis_kendaraan) ? req.body.jenis_kendaraan : 'umum';
    const kategori = KATEGORI.includes(req.body.kategori_biaya) ? req.body.kategori_biaya : 'Lainnya';

    // Scope cabang: Admin boleh global (kosong) atau cabang tertentu.
    // Operasional dipaksa ke cabangnya sendiri.
    let cabang;
    if (req.user.role === 'Admin') {
      cabang = (req.body.cabang || '').trim() || null;
    } else {
      const cab = myCabang(req);
      if (!cab) return res.status(403).json({ error: 'Akun Anda belum punya cabang — tidak bisa menambah item' });
      cabang = cab;
    }

    const { data, error } = await supabase.from('master_item').insert({
      id: uuidv4(), nama, kategori_biaya: kategori, jenis_kendaraan: jenis,
      cabang, dibuat_oleh: req.user.id,
    }).select().single();

    if (error) {
      if (error.code === '23505')
        return res.status(400).json({ error: `Item "${nama}" (${jenis}) sudah ada di scope ini` });
      throw error;
    }
    res.status(201).json({ message: 'Item ditambahkan', data });
  } catch (err) {
    console.error('[master-item/create]', err);
    res.status(500).json({ error: 'Gagal menambah item' });
  }
}

// ── PUT /api/master-item/:id ────────────────────────────────────
async function update(req, res) {
  try {
    const { data: it } = await supabase.from('master_item')
      .select('id, cabang').eq('id', req.params.id).single();
    if (!it) return res.status(404).json({ error: 'Item tidak ditemukan' });

    // Operasional hanya boleh mengubah item cabangnya sendiri (bukan global/cabang lain).
    if (req.user.role !== 'Admin') {
      if ((it.cabang || '') !== myCabang(req) || !it.cabang)
        return res.status(403).json({ error: 'Anda hanya dapat mengubah item cabang Anda sendiri' });
    }

    const { nama, kategori_biaya, jenis_kendaraan, is_active } = req.body;
    const patch = {};
    if (nama           !== undefined) { const n = normNama(nama); if (!n) return res.status(400).json({ error: 'Nama tidak boleh kosong' }); patch.nama = n; }
    if (kategori_biaya !== undefined) patch.kategori_biaya  = KATEGORI.includes(kategori_biaya) ? kategori_biaya : 'Lainnya';
    if (jenis_kendaraan!== undefined) patch.jenis_kendaraan = JENIS_KEND.includes(jenis_kendaraan) ? jenis_kendaraan : 'umum';
    if (is_active      !== undefined) patch.is_active       = !!is_active;
    // cabang hanya boleh diubah Admin
    if (req.body.cabang !== undefined && req.user.role === 'Admin') patch.cabang = (req.body.cabang || '').trim() || null;

    if (!Object.keys(patch).length)
      return res.status(400).json({ error: 'Tidak ada perubahan' });

    const { data, error } = await supabase.from('master_item')
      .update(patch).eq('id', req.params.id).select().single();
    if (error) {
      if (error.code === '23505')
        return res.status(400).json({ error: 'Nama item bentrok dengan item lain di scope yang sama' });
      throw error;
    }
    res.json({ message: 'Item diperbarui', data });
  } catch (err) {
    console.error('[master-item/update]', err);
    res.status(500).json({ error: 'Gagal memperbarui item' });
  }
}

// ── POST /api/master-item/import (Admin) ────────────────────────
// Seed katalog dari item pengajuan lama: kelompokkan per "item dasar",
// tebak tipe kendaraan dari kategori kendaraan pemakainya, kategori biaya
// dari yang tersering. Disimpan sebagai GLOBAL untuk ditinjau Admin.
async function importFromHistory(req, res) {
  try {
    // Peta plat → kategori kendaraan (motor/mobil)
    const vehKat = new Map();
    const { data: vs } = await supabase.from('vehicles').select('plat, kategori');
    for (const v of vs || []) vehKat.set(normPlat(v.plat), (v.kategori || '').trim());

    // Kelompokkan item (status terpercaya, vendor terpilih) per baseKey
    const PAGE = 1000, MAX = 20000;
    const groups = new Map(); // baseKey → { nama, kat:Map, motor, mobil }
    for (let from = 0; from < MAX; from += PAGE) {
      const { data, error } = await supabase.from('submission_items')
        .select('penjelasan, kategori_biaya, vendor_num, submission:submissions!inner(kendaraan, status, vendor_pilihan)')
        .in('submission.status', ['Disetujui', 'Selesai'])
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const it of data || []) {
        const sub = it.submission; if (!sub) continue;
        const vsah = Number(sub.vendor_pilihan) === 2 ? 2 : 1;
        if ((Number(it.vendor_num) || 1) !== vsah) continue;    // abaikan item vendor pembanding
        const key = baseKey(it.penjelasan);
        if (!key || key.length < 2) continue;
        let g = groups.get(key);
        if (!g) { g = { nama: displayBase(it.penjelasan).slice(0, 150), kat: new Map(), motor: 0, mobil: 0 }; groups.set(key, g); }
        const kb = KATEGORI.includes(it.kategori_biaya) ? it.kategori_biaya : 'Lainnya';
        g.kat.set(kb, (g.kat.get(kb) || 0) + 1);
        const vk = vehKat.get(normPlat(sub.kendaraan));
        if (vk === 'motor') g.motor++; else if (vk === 'mobil') g.mobil++;
      }
      if (!data || data.length < PAGE) break;
    }

    // Buang yang sudah ada sbg GLOBAL (nama+jenis sama) agar idempoten saat diulang
    const existing = new Set();
    const { data: ex } = await supabase.from('master_item').select('nama, jenis_kendaraan, cabang').is('cabang', null);
    for (const e of ex || []) existing.add(`${e.nama.toLowerCase()}|${e.jenis_kendaraan}`);

    const rows = [];
    for (const g of groups.values()) {
      const kategori = [...g.kat.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Lainnya';
      const jenis = (g.motor > 0 && g.mobil === 0) ? 'motor' : (g.mobil > 0 && g.motor === 0) ? 'mobil' : 'umum';
      if (existing.has(`${g.nama.toLowerCase()}|${jenis}`)) continue;
      rows.push({ id: uuidv4(), nama: g.nama, kategori_biaya: kategori, jenis_kendaraan: jenis, cabang: null, dibuat_oleh: req.user.id });
    }

    // Sisipkan berkelompok; bila satu kelompok gagal (mis. bentrok unik), coba per-baris.
    let added = 0, skipped = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { data, error } = await supabase.from('master_item').insert(chunk).select('id');
      if (!error) { added += (data?.length || 0); continue; }
      for (const r of chunk) {
        const { error: e2 } = await supabase.from('master_item').insert(r);
        if (e2) skipped++; else added++;
      }
    }

    res.json({ message: `Import selesai: ${added} item baru ditambahkan${skipped ? `, ${skipped} dilewati` : ''}.`, added, skipped, kandidat: rows.length + existing.size });
  } catch (err) {
    console.error('[master-item/import]', err);
    res.status(500).json({ error: 'Gagal import dari data lama: ' + err.message });
  }
}

module.exports = { list, create, update, importFromHistory, KATEGORI, JENIS_KEND };
