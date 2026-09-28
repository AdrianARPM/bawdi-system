// src/controllers/historyController.js  — v18 (riwayat KM sadar-revisi)
// v18 (fix): getLastKM & getVehicleItems kini memakai ITEM EFEKTIF —
//   untuk pengajuan yang punya revisi DISETUJUI, item diambil dari snapshot
//   revisi terakhir (bukan submission_items asli). Menyelaraskan dengan
//   vehicleController.buildReportRows. Sebelumnya, item yang DITAMBAH/DIGANTI
//   lewat revisi tak terlihat → riwayat KM jatuh ke pengajuan lebih lama.
const supabase = require('../../config/supabase');

// Normalisasi teks: trim + lowercase + rapikan spasi ganda.
const normTxt = (v) => (v || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Filter kasar sisi-DB untuk plat: pakai digit plat (toleran beda format penulisan).
// Pencocokan final tetap di JS (normTxt).
const platCoarse = (kendaraan) => {
  const d = (kendaraan || '').replace(/\D+/g, '');
  return d.length >= 2 ? `%${d}%` : `%${(kendaraan || '').trim()}%`;
};

// v28: item yang sah = milik vendor terpilih (default Vendor 1 bila belum dipilih)
const vendorSah = (sub) => (Number(sub?.vendor_pilihan) === 2 ? 2 : 1);
const itemVendorSah = (it, sub) => (Number(it.vendor_num) || 1) === vendorSah(sub);

const TRUSTED = ['Terverifikasi', 'Disetujui', 'Selesai'];

// ── ITEM EFEKTIF per kendaraan ──────────────────────────────────
// Untuk tiap pengajuan berstatus terpercaya milik kendaraan tsb, kembalikan
// daftar item yang BENAR-BENAR berlaku: bila ada revisi disetujui → item
// dari snapshot revisi tertinggi; jika tidak → submission_items asli.
// Hasil: array { sub, penjelasan, km_pengajuan, vendor_num, urutan, satuan, harga, kategori_biaya }.
async function effectiveVehicleItems(kendaraan) {
  const platN = normTxt(kendaraan);

  const { data: subsRaw } = await supabase
    .from('submissions')
    .select('id, nomor_pengajuan, tanggal, status, kendaraan, vendor_pilihan, revisi_count')
    .ilike('kendaraan', platCoarse(kendaraan))
    .in('status', TRUSTED)
    .order('tanggal', { ascending: false })
    .limit(500);

  const subs = (subsRaw || []).filter(s => normTxt(s.kendaraan) === platN);
  if (!subs.length) return [];
  const subById = new Map(subs.map(s => [s.id, s]));
  const ids = subs.map(s => s.id);

  // Snapshot revisi TERTINGGI yang disetujui per pengajuan.
  const { data: snaps } = await supabase
    .from('revision_snapshots')
    .select('id, submission_id, revision_number')
    .in('submission_id', ids)
    .eq('status', 'disetujui')
    .order('revision_number', { ascending: false });
  const finalSnap = new Map();                 // submission_id → snapshot_id final
  for (const s of snaps || []) if (!finalSnap.has(s.submission_id)) finalSnap.set(s.submission_id, s.id);
  const revisedIds = new Set(finalSnap.keys());
  const snapToSub  = new Map([...finalSnap.entries()].map(([sub, snap]) => [snap, sub]));

  const out = [];

  // Item dari snapshot revisi (untuk pengajuan yang direvisi).
  const snapIds = [...finalSnap.values()];
  if (snapIds.length) {
    const { data: rItems } = await supabase
      .from('revision_snapshot_items')
      .select('snapshot_id, penjelasan, km_pengajuan, vendor_num, urutan, satuan, harga, kategori_biaya')
      .in('snapshot_id', snapIds);
    for (const ri of rItems || []) {
      const sub = subById.get(snapToSub.get(ri.snapshot_id));
      if (sub) out.push({ sub, ...ri });
    }
  }

  // Item asli (untuk pengajuan TANPA revisi disetujui).
  const origIds = ids.filter(id => !revisedIds.has(id));
  if (origIds.length) {
    const { data: oItems } = await supabase
      .from('submission_items')
      .select('submission_id, penjelasan, km_pengajuan, vendor_num, urutan, satuan, harga, kategori_biaya')
      .in('submission_id', origIds);
    for (const oi of oItems || []) {
      const sub = subById.get(oi.submission_id);
      if (sub) out.push({ sub, ...oi });
    }
  }

  return out;
}

/**
 * GET /api/history/vehicle
 */
async function getVehicleHistory(req, res) {
  try {
    const { kendaraan, limit = 5 } = req.query;
    if (!kendaraan?.trim())
      return res.status(400).json({ error: 'Parameter kendaraan wajib diisi' });

    const { data: submissions, error } = await supabase
      .from('submissions')
      .select(`
        id, nomor_pengajuan, type, status, tanggal,
        jenis_pembelian, total_harga, jumlah_bayar,
        tanggal_bayar, vendor, vendor2, vendor_pilihan,
        revisi_count, ditutup_at,
        pemohon:users!submissions_pemohon_id_fkey(name),
        items:submission_items(penjelasan, satuan, harga, total, vendor_num, km_pengajuan)
      `)
      .ilike('kendaraan', kendaraan.trim())
      .in('status', ['Selesai', 'Disetujui'])
      .order('tanggal', { ascending: false })
      .limit(20);

    if (error) throw error;
    if (!submissions?.length)
      return res.json({ data: [], message: 'Belum ada riwayat pengajuan untuk kendaraan ini' });

    const result = submissions.slice(0, Number(limit)).map(sub => ({
      ...sub,
      items: (sub.items || []).filter(i => itemVendorSah(i, sub)),
      items_preview: (sub.items || []).filter(i => itemVendorSah(i, sub)).slice(0, 3).map(i => i.penjelasan).join(', '),
    }));
    res.json({ data: result });
  } catch (err) {
    console.error('[history/vehicle]', err);
    res.status(500).json({ error: 'Gagal mengambil riwayat' });
  }
}

/**
 * GET /api/history/last-km?kendaraan=BM1234XX&keyword=ban
 * KM terakhir untuk item yang penjelasannya SAMA-PERSIS keyword (ternormalisasi).
 * Memakai item efektif (revisi-aware) + kas kecil; ambil yang tanggalnya terbaru.
 */
async function getLastKM(req, res) {
  try {
    const { kendaraan, keyword } = req.query;
    if (!kendaraan?.trim())
      return res.status(400).json({ error: 'Parameter kendaraan wajib diisi' });
    if (!keyword?.trim())
      return res.json({ data: null, message: 'Keyword (penjelasan item) belum diisi' });

    const platN = normTxt(kendaraan);
    const kwN   = normTxt(keyword);
    if (!kwN) return res.json({ data: null, message: 'Keyword terlalu pendek' });

    const eff = await effectiveVehicleItems(kendaraan);

    const matched = eff
      .filter(it => it.km_pengajuan != null
                 && itemVendorSah(it, it.sub)
                 && normTxt(it.penjelasan) === kwN)
      .map(it => ({ km_pengajuan: it.km_pengajuan, penjelasan: it.penjelasan, sub: it.sub }));

    // v25: kas kecil sebagai sumber KM juga.
    try {
      const { data: kk } = await supabase
        .from('kas_kecil').select('plat, tanggal, keterangan, km')
        .not('km', 'is', null)
        .ilike('plat', platCoarse(kendaraan))
        .order('tanggal', { ascending: false })
        .limit(500);
      for (const k of kk || []) {
        if (normTxt(k.plat) === platN && normTxt(k.keterangan) === kwN) {
          matched.push({ km_pengajuan: k.km, penjelasan: k.keterangan, sub: { tanggal: k.tanggal, nomor_pengajuan: 'Kas Kecil' } });
        }
      }
    } catch (e) { console.warn('[history/last-km] kas_kecil dilewati:', e.message); }

    if (!matched.length)
      return res.json({ data: null, message: 'Belum ada riwayat KM untuk item serupa di kendaraan ini' });

    matched.sort((a, b) => new Date(b.sub.tanggal) - new Date(a.sub.tanggal));
    const best = matched[0];

    res.json({
      data: {
        tanggal:          best.sub.tanggal,
        km_pengajuan:     best.km_pengajuan,
        nomor_pengajuan:  best.sub.nomor_pengajuan,
        penjelasan_item:  best.penjelasan,
      }
    });
  } catch (err) {
    console.error('[history/last-km]', err);
    res.status(500).json({ error: 'Gagal mengambil KM terakhir' });
  }
}

/**
 * GET /api/history/items?kendaraan=BM1234XX
 * Daftar item UNIK (item efektif, revisi-aware) + KM terakhirnya, untuk autocomplete.
 */
async function getVehicleItems(req, res) {
  try {
    const { kendaraan } = req.query;
    if (!kendaraan?.trim())
      return res.status(400).json({ error: 'Parameter kendaraan wajib diisi' });

    const eff = await effectiveVehicleItems(kendaraan);
    const platN = normTxt(kendaraan);

    const byPenj = new Map(); // penjelasan ternormalisasi → entri terbaru
    for (const it of eff) {
      if (!it.penjelasan) continue;
      if (!itemVendorSah(it, it.sub)) continue;   // v28: abaikan item vendor pembanding
      const key = normTxt(it.penjelasan);
      if (!key) continue;
      const prev = byPenj.get(key);
      if (!prev || new Date(it.sub.tanggal) > new Date(prev.tanggal)) {
        byPenj.set(key, {
          penjelasan:      it.penjelasan.trim(),
          km_pengajuan:    it.km_pengajuan,
          satuan:          it.satuan,
          harga:           it.harga,
          kategori_biaya:  it.kategori_biaya,
          nomor_pengajuan: it.sub.nomor_pengajuan,
          tanggal:         it.sub.tanggal,
        });
      }
    }

    // v25: gabungkan kas kecil — KM terbaru per item bisa berasal dari kas kecil.
    try {
      const { data: kk } = await supabase
        .from('kas_kecil')
        .select('plat, tanggal, keterangan, km, kategori_biaya, harga')
        .not('keterangan', 'is', null)
        .ilike('plat', platCoarse(kendaraan))
        .order('tanggal', { ascending: false })
        .limit(500);
      for (const k of kk || []) {
        if (normTxt(k.plat) !== platN) continue;
        const key = normTxt(k.keterangan);
        if (!key) continue;
        const prev = byPenj.get(key);
        if (!prev || new Date(k.tanggal) > new Date(prev.tanggal)) {
          byPenj.set(key, {
            penjelasan:      k.keterangan.trim(),
            km_pengajuan:    k.km,
            satuan:          prev?.satuan || '',
            harga:           prev?.harga ?? k.harga,
            kategori_biaya:  prev?.kategori_biaya || k.kategori_biaya,
            nomor_pengajuan: 'Kas Kecil',
            tanggal:         k.tanggal,
          });
        }
      }
    } catch (e) { console.warn('[history/items] kas_kecil dilewati:', e.message); }

    const list = [...byPenj.values()].sort((a, b) => a.penjelasan.localeCompare(b.penjelasan));
    res.json({ data: list });
  } catch (err) {
    console.error('[history/items]', err);
    res.status(500).json({ error: 'Gagal mengambil daftar item' });
  }
}

module.exports = { getVehicleHistory, getLastKM, getVehicleItems };
