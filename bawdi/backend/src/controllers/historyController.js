// src/controllers/historyController.js  — v3 (per-item KM tracking)
const supabase = require('../../config/supabase');

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

    const plat  = kendaraan.trim().toLowerCase();
    const kw    = keyword.trim().toLowerCase();
    const words = kw.split(/\s+/).filter(w => w.length > 1);
    if (!words.length)
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
    const matched = items.filter(it => {
      const sub = it.submission;
      if (!sub) return false;
      if (!sub.kendaraan?.toLowerCase().includes(plat)) return false;
      if (!trustedStatus.includes(sub.status)) return false;
      const itemPenj = it.penjelasan?.toLowerCase() || '';
      return words.some(w => itemPenj.includes(w));
    });

    if (!matched.length)
      return res.json({ data: null, message: 'Belum ada riwayat KM untuk item serupa di kendaraan ini' });

    // Urutkan tanggal terbaru
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

module.exports = { getVehicleHistory, getLastKM };
