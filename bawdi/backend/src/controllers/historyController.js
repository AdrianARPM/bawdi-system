// src/controllers/historyController.js  — v17 (dropdown item + exact KM match)
// v17: getLastKM kini mencocokkan penjelasan SAMA-PERSIS (bukan 'mengandung kata'),
//      sehingga 'Lampu Depan' tak lagi keliru cocok dgn 'Kampas Rem Depan'.
//      Tambah getVehicleItems: daftar item unik yg pernah diajukan utk 1 kendaraan
//      (untuk dropdown autocomplete di form).
const supabase = require('../../config/supabase');

// Normalisasi teks: trim + lowercase + rapikan spasi ganda.
const normTxt = (v) => (v || '').trim().toLowerCase().replace(/\s+/g, ' ');

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
      items_preview: sub.items?.slice(0, 3).map(i => i.penjelasan).join(', '),
    }));
    res.json({ data: result });
  } catch (err) {
    console.error('[history/vehicle]', err);
    res.status(500).json({ error: 'Gagal mengambil riwayat' });
  }
}

/**
 * GET /api/history/last-km?kendaraan=BM1234XX&keyword=ban
 * Per-item KM lookup — mencari item yang penjelasannya cocok dengan keyword,
 * mengembalikan km_pengajuan & tanggal dari pengajuan yang mengandung item itu.
 *
 * Hanya menggunakan submission dengan status terpercaya:
 *   Terverifikasi, Disetujui, Selesai
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
    if (!kwN)
      return res.json({ data: null, message: 'Keyword terlalu pendek' });

    // Query submission_items dengan JOIN ke submissions
    const { data: items, error } = await supabase
      .from('submission_items')
      .select(`
        id, penjelasan, km_pengajuan,
        submission:submissions!inner(
          id, nomor_pengajuan, tanggal, status, kendaraan
        )
      `)
      .not('km_pengajuan', 'is', null)
      .order('id', { ascending: false })
      .limit(200);

    if (error) throw error;
    if (!items?.length)
      return res.json({ data: null, message: 'Belum ada riwayat KM untuk item ini' });

    // Filter: plat match + status terpercaya + penjelasan match keyword
    const trustedStatus = ['Terverifikasi', 'Disetujui', 'Selesai'];
    // v17: cocok HANYA bila plat sama-persis & penjelasan item SAMA-PERSIS
    //      (setelah dinormalisasi). Tidak lagi 'mengandung kata'.
    const matched = items.filter(it => {
      const sub = it.submission;
      if (!sub) return false;
      if (normTxt(sub.kendaraan) !== platN) return false;
      if (!trustedStatus.includes(sub.status)) return false;
      return normTxt(it.penjelasan) === kwN;
    });

    // v25: sertakan kas kecil sebagai sumber KM — acuan item bisa dari kas kecil.
    try {
      const { data: kk } = await supabase
        .from('kas_kecil').select('plat, tanggal, keterangan, km').not('km', 'is', null);
      for (const k of kk || []) {
        if (normTxt(k.plat) === platN && normTxt(k.keterangan) === kwN) {
          matched.push({
            km_pengajuan: k.km, penjelasan: k.keterangan,
            submission: { tanggal: k.tanggal, nomor_pengajuan: 'Kas Kecil' },
          });
        }
      }
    } catch (e) { console.warn('[history/last-km] kas_kecil dilewati:', e.message); }

    if (!matched.length)
      return res.json({ data: null, message: 'Belum ada riwayat KM untuk item serupa di kendaraan ini' });

    // Urutkan tanggal terbaru (termasuk kas kecil)
    matched.sort((a, b) => new Date(b.submission.tanggal) - new Date(a.submission.tanggal));
    const best = matched[0];

    res.json({
      data: {
        tanggal:          best.submission.tanggal,
        km_pengajuan:     best.km_pengajuan,
        nomor_pengajuan:  best.submission.nomor_pengajuan,
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
 * Daftar item UNIK yang pernah diajukan utk kendaraan tsb (status terpercaya),
 * masing-masing dgn nomor pengajuan & KM terakhirnya. Untuk dropdown autocomplete.
 */
async function getVehicleItems(req, res) {
  try {
    const { kendaraan } = req.query;
    if (!kendaraan?.trim())
      return res.status(400).json({ error: 'Parameter kendaraan wajib diisi' });

    const platN = normTxt(kendaraan);

    const { data: items, error } = await supabase
      .from('submission_items')
      .select(`
        penjelasan, km_pengajuan, satuan, harga, kategori_biaya,
        submission:submissions!inner(nomor_pengajuan, tanggal, status, kendaraan)
      `)
      .not('penjelasan', 'is', null)
      .order('id', { ascending: false })
      .limit(500);

    if (error) throw error;

    const trusted = ['Terverifikasi', 'Disetujui', 'Selesai'];
    const byPenj = new Map(); // key: penjelasan ternormalisasi → entri terbaru
    for (const it of items || []) {
      const sub = it.submission;
      if (!sub) continue;
      if (normTxt(sub.kendaraan) !== platN) continue;
      if (!trusted.includes(sub.status)) continue;
      const key = normTxt(it.penjelasan);
      if (!key) continue;
      const prev = byPenj.get(key);
      if (!prev || new Date(sub.tanggal) > new Date(prev.tanggal)) {
        byPenj.set(key, {
          penjelasan:      it.penjelasan.trim(),
          km_pengajuan:    it.km_pengajuan,
          satuan:          it.satuan,
          harga:           it.harga,
          kategori_biaya:  it.kategori_biaya,
          nomor_pengajuan: sub.nomor_pengajuan,
          tanggal:         sub.tanggal,
        });
      }
    }

    // v25: gabungkan kas kecil — KM terbaru per item bisa berasal dari kas kecil.
    try {
      const { data: kk } = await supabase
        .from('kas_kecil')
        .select('plat, tanggal, keterangan, km, kategori_biaya, harga')
        .not('keterangan', 'is', null);
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
