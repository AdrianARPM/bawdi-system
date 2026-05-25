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
 * GET /api/history/last-km?kendaraan=BM1234XX
 * Mengembalikan km_pengajuan terakhir + tanggal dari pengajuan sebelumnya
 * untuk auto-fill bagian riwayat KM di form pengajuan baru.
 */
async function getLastKM(req, res) {
  try {
    const { kendaraan } = req.query;
    if (!kendaraan?.trim())
      return res.status(400).json({ error: 'Parameter kendaraan wajib diisi' });

    // Ambil pengajuan terakhir yang punya km_pengajuan (status apapun selain Draft)
    const { data, error } = await supabase
      .from('submissions')
      .select('id, nomor_pengajuan, tanggal, km_pengajuan, jenis_pembelian')
      .ilike('kendaraan', kendaraan.trim())
      .not('km_pengajuan', 'is', null)
      .order('tanggal', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      // Tidak ada riwayat KM — kembalikan null (bukan error)
      return res.json({ data: null, message: 'Belum ada riwayat KM untuk kendaraan ini' });
    }

    res.json({
      data: {
        tanggal:          data.tanggal,
        km_pengajuan:     data.km_pengajuan,
        nomor_pengajuan:  data.nomor_pengajuan,
        jenis_pembelian:  data.jenis_pembelian,
      }
    });
  } catch (err) {
    console.error('[history/last-km]', err);
    res.status(500).json({ error: 'Gagal mengambil KM terakhir' });
  }
}

module.exports = { getVehicleHistory, getLastKM };
