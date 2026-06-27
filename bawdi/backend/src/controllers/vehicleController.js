// src/controllers/vehicleController.js — v10 (Master Data Kendaraan)
// CRUD master kendaraan + laporan per plat + export Excel
// Format export meniru laporan manual perusahaan (FORM LAPORAN):
//   No | No PR | Pemakaian | Biaya Sewa | Biaya Service | Biaya Ban |
//   Biaya Izin Kendaraan | Biaya Jasa | Biaya Lainnya | KM | Selisih KM | Keterangan
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');

// v21: normalisasi nama item utk kelompokkan riwayat per-item
const normTxt = (v) => (v || '').trim().toLowerCase().replace(/\s+/g, ' ');
const KATEGORI = ['Sewa', 'Service', 'Ban', 'Izin Kendaraan', 'Jasa', 'Lainnya'];

// Normalisasi plat: uppercase + rapikan spasi → "bm 1234  aa" => "BM 1234 AA"
const normPlat = (p) => (p || '').trim().replace(/\s+/g, ' ').toUpperCase();

// ── Helper: auto-register plat (dipanggil dari submissionController.create)
async function autoRegisterVehicle(plat, cabang = '') {
  const clean = normPlat(plat);
  if (!clean) return;
  try {
    await supabase.from('vehicles')
      .upsert({ id: uuidv4(), plat: clean, cabang: cabang || '' },
              { onConflict: 'plat', ignoreDuplicates: true });
  } catch (err) {
    // Jangan gagalkan pembuatan pengajuan hanya karena auto-register
    console.error('[vehicles/autoRegister]', err.message);
  }
}

// ── GET /api/vehicles ───────────────────────────────────────────
// List master kendaraan + ringkasan (jumlah pengajuan & total biaya tahun berjalan)
async function list(req, res) {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const from = `${year}-01-01T00:00:00Z`;
    const to   = `${year + 1}-01-01T00:00:00Z`;

    const { data: vehicles, error } = await supabase
      .from('vehicles').select('*').order('plat');
    if (error) throw error;

    // Agregat per plat dari submissions (status terpercaya saja)
    const { data: subs, error: subErr } = await supabase
      .from('submissions')
      .select('kendaraan, total_harga, status, tanggal')
      .in('status', ['Disetujui', 'Selesai'])
      .gte('tanggal', from).lt('tanggal', to);
    if (subErr) throw subErr;

    const agg = {};
    for (const s of subs || []) {
      const key = normPlat(s.kendaraan);
      if (!agg[key]) agg[key] = { count: 0, total: 0 };
      agg[key].count += 1;
      agg[key].total += Number(s.total_harga) || 0;
    }

    // v25: kas kecil ikut menambah TOTAL biaya (tidak menambah jumlah pengajuan).
    // Fault-tolerant: bila tabel belum dibuat (migration belum jalan), abaikan.
    try {
      const { data: kk } = await supabase
        .from('kas_kecil')
        .select('plat, harga, tanggal')
        .gte('tanggal', from).lt('tanggal', to);
      for (const k of kk || []) {
        const key = normPlat(k.plat);
        if (!agg[key]) agg[key] = { count: 0, total: 0 };
        agg[key].total += Number(k.harga) || 0;
      }
    } catch (e) {
      console.warn('[vehicles/list] kas_kecil dilewati:', e.message);
    }

    res.json({
      data: (vehicles || []).map(v => ({
        ...v,
        pengajuan_count: agg[v.plat]?.count || 0,
        total_biaya:     agg[v.plat]?.total || 0,
      })),
      year,
    });
  } catch (err) {
    console.error('[vehicles/list]', err);
    res.status(500).json({ error: 'Gagal mengambil master kendaraan' });
  }
}

// ── POST /api/vehicles ──────────────────────────────────────────
async function create(req, res) {
  try {
    const { plat, pemilik, stnk, pajak, jenis, cabang, keterangan } = req.body;
    const clean = normPlat(plat);
    if (!clean) return res.status(400).json({ error: 'Plat kendaraan wajib diisi' });

    const { data, error } = await supabase.from('vehicles').insert({
      id: uuidv4(), plat: clean,
      pemilik: pemilik || '', stnk: stnk || '', pajak: pajak || '',
      jenis: jenis || '', cabang: cabang || '', keterangan: keterangan || '',
    }).select().single();

    if (error) {
      if (error.code === '23505')
        return res.status(400).json({ error: `Plat ${clean} sudah terdaftar` });
      throw error;
    }
    res.status(201).json({ message: 'Kendaraan ditambahkan', data });
  } catch (err) {
    console.error('[vehicles/create]', err);
    res.status(500).json({ error: 'Gagal menambah kendaraan' });
  }
}

// ── PUT /api/vehicles/:id ───────────────────────────────────────
async function update(req, res) {
  try {
    const { pemilik, stnk, pajak, jenis, cabang, keterangan, is_active } = req.body;
    const patch = {};
    if (pemilik    !== undefined) patch.pemilik    = pemilik;
    if (stnk       !== undefined) patch.stnk       = stnk;
    if (pajak      !== undefined) patch.pajak      = pajak;
    if (jenis      !== undefined) patch.jenis      = jenis;
    if (cabang     !== undefined) patch.cabang     = cabang;
    if (keterangan !== undefined) patch.keterangan = keterangan;
    if (is_active  !== undefined) patch.is_active  = !!is_active;

    const { data, error } = await supabase.from('vehicles')
      .update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ message: 'Kendaraan diperbarui', data });
  } catch (err) {
    console.error('[vehicles/update]', err);
    res.status(500).json({ error: 'Gagal memperbarui kendaraan' });
  }
}

// ════════════ KAS KECIL (v25) — input manual Super Track ════════════
// Perawatan kecil di luar alur pengajuan. Nama OTOMATIS dari akun login.
// Akses (dijaga di routes): Admin / Verifikator / Operasional.

// ── POST /api/vehicles/kas-kecil ────────────────────────────────
async function createKasKecil(req, res) {
  try {
    const { plat, tanggal, keterangan, kategori_biaya, harga, km, selisih_manual } = req.body;
    const clean = normPlat(plat);
    if (!clean) return res.status(400).json({ error: 'Plat wajib diisi' });
    if (!String(keterangan || '').trim())
      return res.status(400).json({ error: 'Rincian/keterangan wajib diisi' });

    const row = {
      id: uuidv4(),
      plat: clean,
      tanggal: tanggal ? new Date(tanggal).toISOString() : new Date().toISOString(),
      nama: req.user?.name || '',            // OTOMATIS dari akun login
      created_by: req.user?.id || null,
      keterangan: String(keterangan).trim(),
      kategori_biaya: KATEGORI.includes(kategori_biaya) ? kategori_biaya : 'Lainnya',
      harga: Number(harga) || 0,
      km: (km === '' || km == null) ? null : Number(km),
      selisih_manual: (selisih_manual === '' || selisih_manual == null) ? null : Number(selisih_manual),
    };

    // Daftarkan plat ke master bila belum terdaftar (sama spt alur pengajuan).
    await autoRegisterVehicle(clean);

    const { data, error } = await supabase.from('kas_kecil').insert(row).select().single();
    if (error) throw error;
    res.status(201).json({ message: 'Kas kecil ditambahkan', data });
  } catch (err) {
    console.error('[vehicles/createKasKecil]', err);
    res.status(500).json({ error: 'Gagal menambah kas kecil: ' + err.message });
  }
}

// ── PUT /api/vehicles/kas-kecil/:id ─────────────────────────────
async function updateKasKecil(req, res) {
  try {
    const { tanggal, keterangan, kategori_biaya, harga, km, selisih_manual } = req.body;
    const patch = { updated_at: new Date().toISOString() };
    if (tanggal        !== undefined) patch.tanggal        = tanggal ? new Date(tanggal).toISOString() : null;
    if (keterangan     !== undefined) patch.keterangan     = String(keterangan).trim();
    if (kategori_biaya !== undefined) patch.kategori_biaya = KATEGORI.includes(kategori_biaya) ? kategori_biaya : 'Lainnya';
    if (harga          !== undefined) patch.harga          = Number(harga) || 0;
    if (km             !== undefined) patch.km             = (km === '' || km == null) ? null : Number(km);
    if (selisih_manual !== undefined) patch.selisih_manual = (selisih_manual === '' || selisih_manual == null) ? null : Number(selisih_manual);

    const { data, error } = await supabase.from('kas_kecil')
      .update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ message: 'Kas kecil diperbarui', data });
  } catch (err) {
    console.error('[vehicles/updateKasKecil]', err);
    res.status(500).json({ error: 'Gagal memperbarui kas kecil: ' + err.message });
  }
}

// ── DELETE /api/vehicles/kas-kecil/:id ──────────────────────────
async function deleteKasKecil(req, res) {
  try {
    const { error } = await supabase.from('kas_kecil').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Kas kecil dihapus' });
  } catch (err) {
    console.error('[vehicles/deleteKasKecil]', err);
    res.status(500).json({ error: 'Gagal menghapus kas kecil: ' + err.message });
  }
}

// ── Internal: susun baris laporan utk satu plat ─────────────────
// Satu baris = satu ITEM dari pengajuan Disetujui/Selesai pada tahun tsb.
async function buildReportRows(plat, year) {
  const from = `${year}-01-01T00:00:00Z`;
  const to   = `${year + 1}-01-01T00:00:00Z`;

  // Ambil submission + item asli (tanpa nested revisi, agar tidak ada
  // ambiguitas relasi PostgREST: submissions↔revision_snapshots punya 2 FK).
  const { data: subs, error } = await supabase
    .from('submissions')
    .select(`
      id, nomor_pengajuan, nomor_urut, tanggal, status, kendaraan, vendor_pilihan,
      pemohon:users!submissions_pemohon_id_fkey(name),
      items:submission_items(penjelasan, satuan, harga, total, vendor_num, km_pengajuan, km_manual, kategori_biaya, urutan)
    `)
    .in('status', ['Disetujui', 'Selesai'])
    .gte('tanggal', from).lt('tanggal', to)
    .order('tanggal', { ascending: true });
  if (error) throw new Error('query submissions: ' + error.message);

  const target = normPlat(plat);
  const candidates = (subs || []).filter(sub => normPlat(sub.kendaraan) === target);

  // Ambil snapshot revisi DISETUJUI untuk submission yg relevan (query terpisah).
  const subIds = candidates.map(s => s.id);
  const revBySub = {};   // { submission_id: snap_items[] dari revisi tertinggi }
  if (subIds.length) {
    const { data: snaps, error: snapErr } = await supabase
      .from('revision_snapshots')
      .select(`
        submission_id, revision_number, status,
        snap_items:revision_snapshot_items(penjelasan, satuan, harga, total, vendor_num, km_pengajuan, km_manual, kategori_biaya, urutan)
      `)
      .in('submission_id', subIds)
      .eq('status', 'disetujui')
      .order('revision_number', { ascending: true });
    if (snapErr) throw new Error('query revisi: ' + snapErr.message);
    // revision_number menaik → yang terakhir menimpa = revisi tertinggi
    for (const sn of snaps || []) {
      if (sn.snap_items?.length) revBySub[sn.submission_id] = sn.snap_items;
    }
  }

  const rows = [];
  for (const sub of candidates) {
    const pickedVendor = sub.vendor_pilihan || 1;

    // Bila ada revisi disetujui, pakai item snapshot revisi terbaru;
    // jika tidak, pakai submission_items asli.
    const sourceItems = revBySub[sub.id] || sub.items || [];

    const items = sourceItems
      .filter(i => (i.vendor_num || 1) === pickedVendor)
      .sort((a, b) => (a.urutan || 0) - (b.urutan || 0));

    for (const it of items) {
      rows.push({
        no_pr:        sub.nomor_pengajuan || sub.nomor_urut || '',
        nama_pemohon: sub.pemohon?.name || '',
        tanggal:      sub.tanggal,
        kategori:  KATEGORI.includes(it.kategori_biaya) ? it.kategori_biaya : 'Lainnya',
        biaya:     Number(it.total) || 0,
        km:        it.km_pengajuan != null ? Number(it.km_pengajuan) : null,
        km_manual: it.km_manual != null ? Number(it.km_manual) : null,
        keterangan: it.penjelasan || '',
      });
    }
  }

  // ── Kas kecil (v25): perawatan kecil di luar alur pengajuan ──────
  // Digabung sebagai baris biasa → ikut perhitungan selisih per-item & total.
  // Fault-tolerant: bila tabel belum ada (migration belum jalan), dilewati.
  try {
    const { data: kk, error: kkErr } = await supabase
      .from('kas_kecil')
      .select('id, plat, tanggal, nama, keterangan, kategori_biaya, harga, km, selisih_manual')
      .gte('tanggal', from).lt('tanggal', to)
      .order('tanggal', { ascending: true });
    if (kkErr) throw kkErr;
    for (const k of (kk || []).filter(x => normPlat(x.plat) === target)) {
      rows.push({
        is_kas_kecil:     true,
        kas_id:           k.id,
        no_pr:            'Kas Kecil',                 // penanda (bukan No PR sungguhan)
        nama_pemohon:     k.nama || '',
        tanggal:          k.tanggal,
        kategori:         KATEGORI.includes(k.kategori_biaya) ? k.kategori_biaya : 'Lainnya',
        biaya:            Number(k.harga) || 0,
        km:               k.km != null ? Number(k.km) : null,
        km_manual:        null,
        keterangan:       k.keterangan || '',
        selisih_override: k.selisih_manual != null ? Number(k.selisih_manual) : null,
      });
    }
  } catch (e) {
    console.warn('[vehicles/report] kas_kecil dilewati:', e.message);
  }

  // Urutkan SEMUA baris (pengajuan + kas kecil) kronologis. Array.sort STABIL
  // → item dalam satu pengajuan tetap urut; kas kecil menyisip sesuai tanggalnya.
  rows.sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));

  // Selisih KM PER-ITEM (v21): tiap item dibandingkan dgn KM item yg SAMA pada
  // pengajuan sebelumnya (urut kronologis). Saat item muncul PERTAMA kali & belum
  // ada riwayat digital, pakai KM Terakhir manual (km_manual) sbg acuan awal item
  // itu. Konsisten dgn selisih per-item di form. Tanpa acuan → selisih kosong.
  const lastKMByItem = {};   // norm(nama item) → km_pengajuan terakhir item itu
  for (const r of rows) {
    if (r.km != null) {
      const key  = normTxt(r.keterangan);
      let   base = lastKMByItem[key];
      if (base == null && r.km_manual != null) base = r.km_manual;  // acuan awal item
      const auto = base != null ? r.km - base : null;
      // v25: kas kecil boleh override selisih manual (menang bila diisi).
      r.selisih_km = (r.selisih_override != null) ? r.selisih_override : auto;
      lastKMByItem[key] = r.km;
    } else {
      r.selisih_km = (r.selisih_override != null) ? r.selisih_override : null;
    }
  }
  return rows;
}

// ── GET /api/vehicles/report?plat=BM+1234+AA&year=2026 ─────────
// JSON laporan utk preview di web sebelum export
async function report(req, res) {
  try {
    const plat = normPlat(req.query.plat);
    const year = Number(req.query.year) || new Date().getFullYear();
    if (!plat) return res.status(400).json({ error: 'Parameter plat wajib diisi' });

    const rows = await buildReportRows(plat, year);
    const totals = { Sewa: 0, Service: 0, Ban: 0, 'Izin Kendaraan': 0, Jasa: 0, Lainnya: 0 };
    rows.forEach(r => { totals[r.kategori] += r.biaya; });

    res.json({ data: { plat, year, rows, totals } });
  } catch (err) {
    console.error('[vehicles/report]', err);
    res.status(500).json({ error: 'Gagal menyusun laporan: ' + err.message });
  }
}

// ── Internal: tulis satu sheet laporan (format FORM LAPORAN) ────
function writeSheet(wb, plat, year, rows, vehicle) {
  // Nama sheet maks 31 char & tanpa karakter terlarang
  const sheetName = plat.replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31) || 'LAPORAN';
  const ws = wb.addWorksheet(sheetName);

  const thin = { style: 'thin' };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const money = '#,##0;(#,##0);"-"';

  ws.columns = [
    { width: 5 },  { width: 22 }, { width: 18 }, { width: 12 }, { width: 12 },
    { width: 13 }, { width: 12 }, { width: 16 }, { width: 12 }, { width: 13 },
    { width: 10 }, { width: 11 }, { width: 30 },
  ];

  // Judul
  ws.mergeCells('A1:M1');
  ws.getCell('A1').value = 'FORM LAPORAN';
  ws.getCell('A1').font = { name: 'Arial', size: 14, bold: true };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  // Header identitas (Pemilik/STNK/Pajak dari master — kosong bila belum diisi)
  const head = [
    ['No. Polisi', plat],
    ['Pemilik',    vehicle?.pemilik || '-'],
    ['Periode',    `Januari - Desember ${year}`],
    ['STNK',       vehicle?.stnk || '-'],
    ['Pajak',      vehicle?.pajak || '-'],
  ];
  head.forEach((h, i) => {
    const r = 3 + i;
    ws.getCell(`A${r}`).value = h[0];
    ws.getCell(`A${r}`).font = { name: 'Arial', size: 10 };
    ws.getCell(`D${r}`).value = h[1];
    ws.getCell(`D${r}`).font = { name: 'Arial', size: 10, bold: true };
  });

  // Header tabel (baris 10) — persis kolom laporan manual
  const HEADERS = ['No', 'No PR', 'Nama Pemohon', 'Pemakaian', 'Biaya Sewa', 'Biaya Service',
                   'Biaya Ban', 'Biaya Izin Kendaraan', 'Biaya Jasa', 'Biaya Lainnya', 'KM', 'Selisih KM', 'Keterangan'];
  const hrow = ws.getRow(10);
  HEADERS.forEach((t, idx) => {
    const c = hrow.getCell(idx + 1);
    c.value = t;
    c.font = { name: 'Arial', size: 10, bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = border;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  });
  hrow.height = 28;

  // Mapping kategori → indeks kolom biaya (E..J = 5..10)
  const COL = { 'Sewa': 5, 'Service': 6, 'Ban': 7, 'Izin Kendaraan': 8, 'Jasa': 9, 'Lainnya': 10 };

  // Baris data
  const startRow = 11;
  rows.forEach((r, i) => {
    const row = ws.getRow(startRow + i);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = r.no_pr;
    row.getCell(3).value = r.nama_pemohon || '';
    const d = new Date(r.tanggal);
    row.getCell(4).value = d;
    row.getCell(4).numFmt = 'dd-mmm-yy';
    row.getCell(COL[r.kategori]).value = r.biaya;
    if (r.km != null)        row.getCell(11).value = r.km;
    if (r.selisih_km != null) row.getCell(12).value = r.selisih_km;
    row.getCell(13).value = r.keterangan;
    for (let c = 1; c <= 13; c++) {
      const cell = row.getCell(c);
      cell.border = border;
      cell.font = { name: 'Arial', size: 10 };
      if (c >= 5 && c <= 10) cell.numFmt = money;
      if (c === 11 || c === 12) cell.numFmt = '#,##0';
    }
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
  });

  // Baris total — pakai FORMULA SUM (bukan nilai hardcode)
  const endData = startRow + Math.max(rows.length, 1) - 1;
  const totalRow = ws.getRow(endData + 1);
  totalRow.getCell(4).value = 'TOTAL';
  totalRow.getCell(4).font = { name: 'Arial', size: 10, bold: true };
  ['E', 'F', 'G', 'H', 'I', 'J'].forEach(colL => {
    const cell = totalRow.getCell(colL.charCodeAt(0) - 64);
    cell.value = { formula: `SUM(${colL}${startRow}:${colL}${endData})` };
    cell.numFmt = money;
    cell.font = { name: 'Arial', size: 10, bold: true };
  });
  for (let c = 1; c <= 13; c++) totalRow.getCell(c).border = border;

  // Blok ringkasan (mengikuti laporan manual)
  const sumStart = endData + 3;
  const sumRows = [
    ['Biaya Sewa',                 { formula: `E${endData + 1}` }],
    ['Biaya Perawatan',            { formula: `F${endData + 1}+G${endData + 1}` }],
    ['Biaya Lainnya',              { formula: `H${endData + 1}+I${endData + 1}+J${endData + 1}` }],
    ['Sisa yang harus dibayarkan', 0],
  ];
  sumRows.forEach((s, i) => {
    const r = sumStart + i;
    ws.getCell(`E${r}`).value = s[0];
    ws.getCell(`E${r}`).font = { name: 'Arial', size: 10 };
    ws.getCell(`F${r}`).value = s[1];
    ws.getCell(`F${r}`).numFmt = money;
    ws.getCell(`F${r}`).font = { name: 'Arial', size: 10 };
  });

  // Tanggal & blok tanda tangan
  ws.getCell(`J${sumStart}`).value = 'Tanggal';
  ws.getCell(`M${sumStart}`).value = new Date(`${year}-12-31`);
  ws.getCell(`M${sumStart}`).numFmt = 'dd-mmm-yy';
  ws.getCell(`J${sumStart + 4}`).value = 'Dibuat oleh';
  ws.getCell(`J${sumStart + 7}`).value = 'Diperiksa Oleh :';
  ws.getCell(`J${sumStart + 11}`).value = 'Disetujui Oleh  :';
  [sumStart, sumStart + 4, sumStart + 7, sumStart + 11].forEach(r => {
    ws.getCell(`J${r}`).font = { name: 'Arial', size: 10 };
  });
}

// ── GET /api/vehicles/export?year=2026[&plat=BM+1234+AA] ───────
// Tanpa plat: SEMUA kendaraan aktif, satu sheet per plat (seperti file manual).
// Dengan plat: hanya kendaraan itu.
async function exportExcel(req, res) {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const onePlat = req.query.plat ? normPlat(req.query.plat) : null;

    let vehicles;
    if (onePlat) {
      const { data } = await supabase.from('vehicles').select('*').eq('plat', onePlat).limit(1);
      vehicles = data?.length ? data : [{ plat: onePlat, pemilik: '', stnk: '', pajak: '' }];
    } else {
      const { data, error } = await supabase.from('vehicles')
        .select('*').eq('is_active', true).order('plat');
      if (error) throw error;
      vehicles = data || [];
    }
    if (!vehicles.length)
      return res.status(404).json({ error: 'Tidak ada kendaraan untuk diexport' });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'BAWDI Maintenance System';
    wb.created = new Date();

    let sheetCount = 0;
    for (const v of vehicles) {
      const rows = await buildReportRows(v.plat, year);
      // Saat export semua: lewati kendaraan tanpa transaksi agar file rapi.
      // Saat export satu plat: tetap buat sheet walau kosong.
      if (!rows.length && !onePlat) continue;
      writeSheet(wb, v.plat, year, rows, v);
      sheetCount++;
    }
    if (sheetCount === 0)
      return res.status(404).json({ error: `Tidak ada transaksi pada tahun ${year}` });

    const fname = onePlat
      ? `BAWDI - Laporan ${onePlat} ${year}.xlsx`
      : `BAWDI - Laporan Kendaraan ${year}.xlsx`;

    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      `attachment; filename="${encodeURIComponent(fname)}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[vehicles/export]', err);
    res.status(500).json({ error: 'Gagal export Excel: ' + err.message });
  }
}

module.exports = { list, create, update, report, exportExcel, autoRegisterVehicle, KATEGORI,
                   createKasKecil, updateKasKecil, deleteKasKecil };
