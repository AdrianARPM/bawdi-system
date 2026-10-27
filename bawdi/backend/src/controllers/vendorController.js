// src/controllers/vendorController.js — v1 (Master Data Vendor / Supplier)
// CRUD master vendor. Jadi sumber tunggal nama + NPWP + rekening, supaya
// tidak diketik ulang tiap pengajuan. Kelola hanya Admin; list terbuka
// untuk semua user login (dibutuhkan autofill di form pengajuan).
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');
const { buildAliasIndex } = require('../utils/plat');

const clean = (v) => (v || '').trim();
const normNama = (v) => clean(v).replace(/\s+/g, ' ');

// Status yang TIDAK dihitung sebagai "vendor pernah dipakai" (pengajuan batal/ditolak).
const EXCLUDE_STATUS = new Set(['Ditolak', 'Dibatalkan']);

// Nama vendor yang BENAR-BENAR dipakai di satu pengajuan.
// vendor_pilihan = 2 → vendor2 (vendor pembanding yang dipilih); selain itu
// (1 / null / belum memilih) → vendor utama. Fallback silang bila salah satu kosong.
const usedVendorName = (s) =>
  Number(s.vendor_pilihan) === 2 ? (clean(s.vendor2) || clean(s.vendor))
                                 : (clean(s.vendor)  || clean(s.vendor2));

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

    // Agregasi pemakaian per nama vendor (case-insensitive, fault-tolerant):
    //   count  = jumlah pengajuan (vendor terpilih, kecuali ditolak/dibatalkan)
    //   cabang = banyak cabang/project berbeda yang memakai vendor
    //   unit   = banyak kendaraan/plat berbeda (ternormalisasi alias) yang memakai vendor
    const agg = {};  // key -> { count, cabang:Set, units:Set }
    try {
      const { data: subs } = await supabase.from('submissions')
        .select('vendor, vendor2, vendor_pilihan, cabang_manual, kendaraan, status');

      let idx = null;
      try { idx = await buildAliasIndex(supabase); } catch { idx = null; }
      const platOf = (k) => idx ? idx.currentOf(k) : clean(k).toUpperCase();

      for (const s of subs || []) {
        if (EXCLUDE_STATUS.has(s.status)) continue;
        const key = normNama(usedVendorName(s)).toLowerCase();
        if (!key) continue;
        const a = agg[key] || (agg[key] = { count: 0, cabang: new Set(), units: new Set() });
        a.count++;
        const cab = clean(s.cabang_manual); if (cab) a.cabang.add(cab.toLowerCase());
        const pl  = platOf(s.kendaraan);    if (pl)  a.units.add(pl);
      }
    } catch (e) {
      console.warn('[vendors/list] agregasi pemakaian dilewati:', e.message);
    }

    res.json({
      data: (rows || []).map(v => {
        const a = agg[normNama(v.nama).toLowerCase()];
        return {
          ...v,
          rekening: composeRekening(v),
          pengajuan_count: a ? a.count        : 0,
          cabang_count:    a ? a.cabang.size  : 0,
          unit_count:      a ? a.units.size   : 0,
        };
      }),
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

// ── GET /api/vendors/:id/usage ──────────────────────────────────
// Rincian pemakaian satu vendor: cabang mana + plat mana yang memakainya.
// Dipanggil on-demand saat kartu vendor diklik (payload list tetap ringan).
async function usage(req, res) {
  try {
    const { data: v, error } = await supabase.from('vendors')
      .select('id, nama').eq('id', req.params.id).single();
    if (error || !v) return res.status(404).json({ error: 'Vendor tidak ditemukan' });

    const key = normNama(v.nama).toLowerCase();

    const { data: subs } = await supabase.from('submissions')
      .select('vendor, vendor2, vendor_pilihan, cabang_manual, kendaraan, status, nomor_pengajuan, tanggal');

    let idx = null;
    try { idx = await buildAliasIndex(supabase); } catch { idx = null; }
    const platOf = (k) => idx ? idx.currentOf(k) : clean(k).toUpperCase();

    const byCabang = new Map();   // nama cabang -> Map(plat -> { count, last })
    let total = 0;
    for (const s of subs || []) {
      if (EXCLUDE_STATUS.has(s.status)) continue;
      if (normNama(usedVendorName(s)).toLowerCase() !== key) continue;
      total++;
      const cab = clean(s.cabang_manual) || '(Tanpa cabang)';
      if (!byCabang.has(cab)) byCabang.set(cab, new Map());
      const units = byCabang.get(cab);
      const pl = platOf(s.kendaraan) || '(Tanpa plat)';
      const u = units.get(pl) || { count: 0, last: null };
      u.count++;
      if (s.tanggal && (!u.last || s.tanggal > u.last)) u.last = s.tanggal;
      units.set(pl, u);
    }

    const cabang = [...byCabang.entries()].map(([nama, units]) => {
      const list = [...units.entries()]
        .map(([plat, u]) => ({ plat, count: u.count, last: u.last }))
        .sort((a, b) => b.count - a.count || a.plat.localeCompare(b.plat));
      const count = list.reduce((n, u) => n + u.count, 0);
      return { nama, count, units: list };
    }).sort((a, b) => b.count - a.count || a.nama.localeCompare(b.nama));

    res.json({ data: { vendor: { id: v.id, nama: v.nama }, total, cabang } });
  } catch (err) {
    console.error('[vendors/usage]', err);
    res.status(500).json({ error: 'Gagal mengambil rincian pemakaian vendor' });
  }
}

module.exports = { list, create, update, usage, composeRekening };
