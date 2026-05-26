// src/controllers/historyController.js  — v2 (+ getLastKM)
const supabase = require('../../config/supabase');

/**
 * GET /api/history/vehicle
 * Riwayat pengajuan selesai/disetujui untuk suatu kendaraan
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
        km_pengajuan, revisi_count, ditutup_at,
        pemohon:users!submissions_pemohon_id_fkey(name),
        items:submission_items(penjelasan, satuan, harga, total, vendor_num)
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
 * Mengembalikan km_pengajuan terakhir + tanggal dari pengajuan sebelumnya
 * berdasarkan plat kendaraan + item yang paling relevan dengan keyword.
 *
 * Prioritas: submission yang itemnya mengandung keyword → jika tidak ada, ambil terbaru saja.
 */
async function getLastKM(req, res) {
  try {
    const { kendaraan, keyword } = req.query;
    if (!kendaraan?.trim())
      return res.status(400).json({ error: 'Parameter kendaraan wajib diisi' });

    // Ambil semua submission untuk plat ini yang punya km_pengajuan
    const { data: submissions, error } = await supabase
      .from('submissions')
      .select('id, nomor_pengajuan, tanggal, km_pengajuan, jenis_pembelian, items:submission_items(penjelasan)')
      .ilike('kendaraan', kendaraan.trim())
      .not('km_pengajuan', 'is', null)
      .order('tanggal', { ascending: false })
      .limit(20);

    if (error || !submissions?.length) {
      return res.json({ data: null, message: 'Belum ada riwayat KM untuk kendaraan ini' });
    }

    let best = submissions[0]; // default: paling baru

    // Jika ada keyword, cari submission yang itemnya paling relevan
    if (keyword?.trim()) {
      const kw = keyword.trim().toLowerCase();
      const words = kw.split(/\s+/).filter(w => w.length > 1);

      // Cari submission yang itemnya mengandung kata dari keyword
      const matched = submissions.find(sub =>
        sub.items?.some(item =>
          words.some(w => item.penjelasan?.toLowerCase().includes(w))
        )
      );

      if (matched) best = matched;
    }

    res.json({
      data: {
        tanggal:         best.tanggal,
        km_pengajuan:    best.km_pengajuan,
        nomor_pengajuan: best.nomor_pengajuan,
        jenis_pembelian: best.jenis_pembelian,
      }
    });
  } catch (err) {
    console.error('[history/last-km]', err);
    res.status(500).json({ error: 'Gagal mengambil KM terakhir' });
  }
}

module.exports = { getVehicleHistory, getLastKM };
