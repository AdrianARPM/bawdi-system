// src/controllers/historyController.js
// Mencari riwayat pengajuan sebelumnya berdasarkan plat kendaraan + kata kunci item
const supabase = require('../../config/supabase');

/**
 * GET /api/history/vehicle
 * Query params:
 *   kendaraan  — plat nomor kendaraan (wajib)
 *   keyword    — kata kunci item, misal "ban", "oli", "rem" (opsional)
 *   limit      — jumlah hasil (default 5)
 *
 * Mengembalikan riwayat pengajuan yang sudah SELESAI dari kendaraan tersebut,
 * diurutkan dari terbaru, dengan item yang relevan disorot.
 */
async function getVehicleHistory(req, res) {
  try {
    const { kendaraan, keyword, limit = 5 } = req.query;

    if (!kendaraan?.trim()) {
      return res.status(400).json({ error: 'Parameter kendaraan wajib diisi' });
    }

    // Ambil semua submission dari kendaraan ini yang sudah selesai atau disetujui
    const { data: submissions, error } = await supabase
      .from('submissions')
      .select(`
        id, nomor_pengajuan, type, status, tanggal,
        jenis_pembelian, total_harga, jumlah_bayar,
        tanggal_bayar, vendor, vendor2, vendor_pilihan,
        revisi_count, ditutup_at,
        pemohon:users!submissions_pemohon_id_fkey(name),
        items:submission_items(penjelasan, satuan, harga, total, vendor_num)
      `)
      .ilike('kendaraan', kendaraan.trim())
      .in('status', ['Selesai', 'Disetujui'])
      .order('tanggal', { ascending: false })
      .limit(20); // Ambil 20, filter relevan di sini

    if (error) throw error;
    if (!submissions?.length) {
      return res.json({ data: [], message: 'Belum ada riwayat pengajuan untuk kendaraan ini' });
    }

    // Filter berdasarkan keyword jika ada
    let filtered = submissions;
    if (keyword?.trim()) {
      const kw = keyword.trim().toLowerCase();
      // Pecah keyword menjadi kata-kata individual untuk pencocokan lebih fleksibel
      const words = kw.split(/\s+/).filter(w => w.length > 2);

      filtered = submissions.filter(sub => {
        // Cek di jenis_pembelian
        const matchJenis = sub.jenis_pembelian?.toLowerCase().includes(kw);

        // Cek di semua item penjelasan
        const matchItem = sub.items?.some(item => {
          const penjel = item.penjelasan?.toLowerCase() || '';
          return words.some(w => penjel.includes(w));
        });

        return matchJenis || matchItem;
      });
    }

    // Ambil sesuai limit dan format output
    const result = filtered.slice(0, Number(limit)).map(sub => {
      // Vendor yang dipakai
      const vendorDipakai = sub.vendor_pilihan === 2
        ? sub.vendor2
        : sub.vendor;

      // Filter item yang relevan dengan keyword
      let relevantItems = sub.items || [];
      if (keyword?.trim()) {
        const kw   = keyword.trim().toLowerCase();
        const words = kw.split(/\s+/).filter(w => w.length > 2);
        const matched = relevantItems.filter(item =>
          words.some(w => item.penjelasan?.toLowerCase().includes(w))
        );
        if (matched.length > 0) relevantItems = matched;
      }

      return {
        id:              sub.id,
        nomor_pengajuan: sub.nomor_pengajuan,
        type:            sub.type,
        status:          sub.status,
        tanggal:         sub.tanggal,
        tanggal_bayar:   sub.tanggal_bayar,
        ditutup_at:      sub.ditutup_at,
        pemohon:         sub.pemohon?.name,
        jenis_pembelian: sub.jenis_pembelian,
        vendor_dipakai:  vendorDipakai,
        total_harga:     sub.total_harga,
        jumlah_bayar:    sub.jumlah_bayar,
        items_relevan:   relevantItems,
        // Hitung berapa hari lalu
        hari_lalu: Math.floor(
          (Date.now() - new Date(sub.tanggal_bayar || sub.tanggal)) / (1000 * 60 * 60 * 24)
        ),
      };
    });

    res.json({
      data: result,
      total: result.length,
      kendaraan: kendaraan.trim(),
      keyword: keyword?.trim() || null,
    });
  } catch (err) {
    console.error('[history/vehicle]', err);
    res.status(500).json({ error: 'Gagal mengambil riwayat kendaraan' });
  }
}

module.exports = { getVehicleHistory };
