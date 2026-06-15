// src/controllers/vehicleController.js — v10 (Master Data Kendaraan)
// CRUD master kendaraan + laporan per plat + export Excel
// Format export meniru laporan manual perusahaan (FORM LAPORAN):
//   No | No PR | Pemakaian | Biaya Sewa | Biaya Service | Biaya Ban |
//   Biaya Izin Kendaraan | Biaya Lainnya | KM | Selisih KM | Keterangan
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');

const KATEGORI = ['Sewa', 'Service', 'Ban', 'Izin Kendaraan', 'Lainnya'];

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

// ── Internal: susun baris laporan utk satu plat ─────────────────
// Satu baris = satu ITEM dari pengajuan Disetujui/Selesai pada tahun tsb.
async function buildReportRows(plat, year) {
  const from = `${year}-01-01T00:00:00Z`;
  const to   = `${year + 1}-01-01T00:00:00Z`;

  const { data: subs, error } = await supabase
    .from('submissions')
    .select(`
      id, nomor_pengajuan, nomor_urut, tanggal, status, kendaraan, vendor_pilihan, active_revision_id,
      items:submission_items(penjelasan, satuan, harga, total, vendor_num, km_pengajuan, kategori_biaya, urutan),
      revisions:revision_snapshots(
        id, revision_number, status,
        snap_items:revision_snapshot_items(penjelasan, satuan, harga, total, vendor_num, km_pengajuan, kategori_biaya, urutan)
      )
    `)
    .in('status', ['Disetujui', 'Selesai'])
    .gte('tanggal', from).lt('tanggal', to)
    .order('tanggal', { ascending: true });
  if (error) throw error;

  const target = normPlat(plat);
  const rows = [];

  for (const sub of subs || []) {
    if (normPlat(sub.kendaraan) !== target) continue;
    const pickedVendor = sub.vendor_pilihan || 1;

    // Bila ada revisi yang DISETUJUI, pakai item dari snapshot revisi terbaru
    // (submission_items sengaja tidak ditimpa saat approve agar tab "Asli"
    //  tetap original — jadi laporan harus ambil dari snapshot).
    const approvedRevs = (sub.revisions || [])
      .filter(r => r.status === 'disetujui')
      .sort((a, b) => (b.revision_number || 0) - (a.revision_number || 0));
    const sourceItems = approvedRevs[0]?.snap_items?.length
      ? approvedRevs[0].snap_items
      : (sub.items || []);

    const items = sourceItems
      .filter(i => (i.vendor_num || 1) === pickedVendor)
      .sort((a, b) => (a.urutan || 0) - (b.urutan || 0));

    for (const it of items) {
      rows.push({
        no_pr:     sub.nomor_urut || sub.nomor_pengajuan || '',
        tanggal:   sub.tanggal,
        kategori:  KATEGORI.includes(it.kategori_biaya) ? it.kategori_biaya : 'Lainnya',
        biaya:     Number(it.total) || 0,
        km:        it.km_pengajuan != null ? Number(it.km_pengajuan) : null,
        keterangan: it.penjelasan || '',
      });
    }
  }

  // Selisih KM: beda dgn KM terisi sebelumnya (urut kronologis)
  let prevKM = null;
  for (const r of rows) {
    if (r.km != null) {
      r.selisih_km = prevKM != null ? r.km - prevKM : null;
      prevKM = r.km;
    } else {
      r.selisih_km = null;
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
    const totals = { Sewa: 0, Service: 0, Ban: 0, 'Izin Kendaraan': 0, Lainnya: 0 };
    rows.forEach(r => { totals[r.kategori] += r.biaya; });

    res.json({ data: { plat, year, rows, totals } });
  } catch (err) {
    console.error('[vehicles/report]', err);
    res.status(500).json({ error: 'Gagal menyusun laporan' });
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
    { width: 5 },  { width: 9 },  { width: 12 }, { width: 12 }, { width: 13 },
    { width: 12 }, { width: 16 }, { width: 13 }, { width: 10 }, { width: 11 }, { width: 30 },
  ];

  // Judul
  ws.mergeCells('A1:K1');
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
  const HEADERS = ['No', 'No PR', 'Pemakaian', 'Biaya Sewa', 'Biaya Service', 'Biaya Ban',
                   'Biaya Izin Kendaraan', 'Biaya Lainnya', 'KM', 'Selisih KM', 'Keterangan'];
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

  // Mapping kategori → indeks kolom biaya (D..H = 4..8)
  const COL = { 'Sewa': 4, 'Service': 5, 'Ban': 6, 'Izin Kendaraan': 7, 'Lainnya': 8 };

  // Baris data
  const startRow = 11;
  rows.forEach((r, i) => {
    const row = ws.getRow(startRow + i);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = r.no_pr;
    const d = new Date(r.tanggal);
    row.getCell(3).value = d;
    row.getCell(3).numFmt = 'dd-mmm-yy';
    row.getCell(COL[r.kategori]).value = r.biaya;
    if (r.km != null)        row.getCell(9).value  = r.km;
    if (r.selisih_km != null) row.getCell(10).value = r.selisih_km;
    row.getCell(11).value = r.keterangan;
    for (let c = 1; c <= 11; c++) {
      const cell = row.getCell(c);
      cell.border = border;
      cell.font = { name: 'Arial', size: 10 };
      if (c >= 4 && c <= 8) cell.numFmt = money;
      if (c === 9 || c === 10) cell.numFmt = '#,##0';
    }
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
  });

  // Baris total — pakai FORMULA SUM (bukan nilai hardcode)
  const endData = startRow + Math.max(rows.length, 1) - 1;
  const totalRow = ws.getRow(endData + 1);
  totalRow.getCell(3).value = 'TOTAL';
  totalRow.getCell(3).font = { name: 'Arial', size: 10, bold: true };
  ['D', 'E', 'F', 'G', 'H'].forEach(colL => {
    const cell = totalRow.getCell(colL.charCodeAt(0) - 64);
    cell.value = { formula: `SUM(${colL}${startRow}:${colL}${endData})` };
    cell.numFmt = money;
    cell.font = { name: 'Arial', size: 10, bold: true };
  });
  for (let c = 1; c <= 11; c++) totalRow.getCell(c).border = border;

  // Blok ringkasan (mengikuti laporan manual)
  const sumStart = endData + 3;
  const sumRows = [
    ['Biaya Sewa',                 { formula: `D${endData + 1}` }],
    ['Biaya Perawatan',            { formula: `E${endData + 1}+F${endData + 1}` }],
    ['Biaya Lainnya',              { formula: `G${endData + 1}+H${endData + 1}` }],
    ['Sisa yang harus dibayarkan', 0],
  ];
  sumRows.forEach((s, i) => {
    const r = sumStart + i;
    ws.getCell(`D${r}`).value = s[0];
    ws.getCell(`D${r}`).font = { name: 'Arial', size: 10 };
    ws.getCell(`E${r}`).value = s[1];
    ws.getCell(`E${r}`).numFmt = money;
    ws.getCell(`E${r}`).font = { name: 'Arial', size: 10 };
  });

  // Tanggal & blok tanda tangan
  ws.getCell(`H${sumStart}`).value = 'Tanggal';
  ws.getCell(`K${sumStart}`).value = new Date(`${year}-12-31`);
  ws.getCell(`K${sumStart}`).numFmt = 'dd-mmm-yy';
  ws.getCell(`H${sumStart + 4}`).value = 'Dibuat oleh';
  ws.getCell(`H${sumStart + 7}`).value = 'Diperiksa Oleh :';
  ws.getCell(`H${sumStart + 11}`).value = 'Disetujui Oleh  :';
  [sumStart, sumStart + 4, sumStart + 7, sumStart + 11].forEach(r => {
    ws.getCell(`H${r}`).font = { name: 'Arial', size: 10 };
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

module.exports = { list, create, update, report, exportExcel, autoRegisterVehicle, KATEGORI };
