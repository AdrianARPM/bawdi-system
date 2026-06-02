// src/controllers/analyticsController.js
const supabase = require('../../config/supabase');

// Hanya role manajemen yang boleh akses analitik
const MANAGER_ROLES = ['Admin', 'Verifikator', 'Approval'];
const isManager = (user) =>
  MANAGER_ROLES.includes(user?.role) || user?.jabatan === 'Kepala Operasional';

const BULAN_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

/**
 * GET /api/analytics?months=6
 * Mengembalikan data agregat untuk dashboard analitik.
 * Pengeluaran dihitung dari status terpercaya: Disetujui & Selesai.
 */
async function getAnalytics(req, res) {
  try {
    if (!isManager(req.user))
      return res.status(403).json({ error: 'Hanya manajemen yang dapat mengakses analitik' });

    const months = Math.min(Math.max(parseInt(req.query.months) || 6, 1), 24);
    const since  = new Date();
    since.setMonth(since.getMonth() - months + 1);
    since.setDate(1); since.setHours(0, 0, 0, 0);

    // Ambil semua pengajuan dengan status terpercaya (komitmen biaya nyata)
    const { data: subs, error } = await supabase
      .from('submissions')
      .select(`
        id, nomor_pengajuan, status, tanggal, kendaraan, vendor, vendor2,
        vendor_pilihan, jenis_pembelian, total_harga, jumlah_bayar, cabang
      `)
      .in('status', ['Disetujui', 'Selesai'])
      .gte('tanggal', since.toISOString())
      .order('tanggal', { ascending: true });

    if (error) throw error;

    const data = subs || [];

    // Nilai pengeluaran: pakai jumlah_bayar jika ada, jika tidak pakai total_harga
    const nilai = (s) => Number(s.jumlah_bayar) || Number(s.total_harga) || 0;

    // ── Summary ───────────────────────────────────────────────
    const totalPengeluaran = data.reduce((sum, s) => sum + nilai(s), 0);
    const totalPengajuan   = data.length;
    const rataRata         = totalPengajuan ? Math.round(totalPengeluaran / totalPengajuan) : 0;

    const now = new Date();
    const pengajuanBulanIni = data.filter(s => {
      const d = new Date(s.tanggal);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    // ── Per Bulan ─────────────────────────────────────────────
    const bulanMap = {};
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      bulanMap[key] = { label: `${BULAN_ID[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`, total: 0, count: 0 };
    }
    data.forEach(s => {
      const d = new Date(s.tanggal);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (bulanMap[key]) { bulanMap[key].total += nilai(s); bulanMap[key].count += 1; }
    });
    const perBulan = Object.values(bulanMap);

    // ── Per Kendaraan (top 5 paling boros) ────────────────────
    const kendaraanMap = {};
    data.forEach(s => {
      const k = (s.kendaraan || '—').trim().toUpperCase();
      if (!kendaraanMap[k]) kendaraanMap[k] = { kendaraan: k, total: 0, count: 0 };
      kendaraanMap[k].total += nilai(s); kendaraanMap[k].count += 1;
    });
    const perKendaraan = Object.values(kendaraanMap).sort((a, b) => b.total - a.total).slice(0, 5);

    // ── Per Jenis Pembelian ───────────────────────────────────
    const jenisMap = {};
    data.forEach(s => {
      const j = (s.jenis_pembelian || 'Lainnya').trim();
      if (!jenisMap[j]) jenisMap[j] = { jenis: j, total: 0, count: 0 };
      jenisMap[j].total += nilai(s); jenisMap[j].count += 1;
    });
    const perJenis = Object.values(jenisMap).sort((a, b) => b.total - a.total).slice(0, 8);

    // ── Per Vendor (top 5 paling sering) ──────────────────────
    const vendorMap = {};
    data.forEach(s => {
      // Pakai vendor terpilih jika ada perbandingan
      const v = (s.vendor_pilihan === 2 ? s.vendor2 : s.vendor) || '—';
      const key = v.trim();
      if (!vendorMap[key]) vendorMap[key] = { vendor: key, total: 0, count: 0 };
      vendorMap[key].total += nilai(s); vendorMap[key].count += 1;
    });
    const perVendor = Object.values(vendorMap).sort((a, b) => b.count - a.count).slice(0, 5);

    // ── Per Cabang ────────────────────────────────────────────
    const cabangMap = {};
    data.forEach(s => {
      const c = (s.cabang || '—').trim();
      if (!cabangMap[c]) cabangMap[c] = { cabang: c, total: 0, count: 0 };
      cabangMap[c].total += nilai(s); cabangMap[c].count += 1;
    });
    const perCabang = Object.values(cabangMap).sort((a, b) => b.total - a.total);

    res.json({
      summary: { totalPengeluaran, totalPengajuan, rataRata, pengajuanBulanIni, months },
      perBulan, perKendaraan, perJenis, perVendor, perCabang,
    });
  } catch (err) {
    console.error('[analytics]', err);
    res.status(500).json({ error: 'Gagal mengambil data analitik' });
  }
}

module.exports = { getAnalytics };
