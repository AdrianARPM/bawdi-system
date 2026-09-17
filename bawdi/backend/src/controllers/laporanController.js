// src/controllers/laporanController.js — v1 (Laporan Akunting)
// Ekspor Excel untuk kebutuhan pembukuan: Daftar Transaksi & Rekap PPh23.
// Difilter per periode berdasar TANGGAL BAYAR (hanya yang sudah dibayar).
// REVISION-AWARE: bila pengajuan punya revisi disetujui, nilai ppn/pph23/total
// diambil dari snapshot revisi TERAKHIR (bukan nilai submission yang bisa stale).
const supabase = require('../../config/supabase');
const ExcelJS = require('exceljs');

const BULAN = ['', 'Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const money = '#,##0;(#,##0);"-"';

// Urai % / nilai PPh23 / DPP dari teks bebas — toleran terhadap banyak format:
//   "Rp.250.000,- x 2% = Rp.5.000,-", "2% x 1.850.000., = 37.000 (Jasa)",
//   "2% X Rp. 150.000,- = Rp. 3.000,-", "(336.000:1.11)=Rp.302.703,- x 2% = Rp.6.054".
// Strategi: PPh23 = angka setelah tanda '=' TERAKHIR; % = "<digit>%" pertama;
// DPP = dihitung dari PPh23 / tarif (bila keduanya ada).
function parsePph23(txt) {
  const raw = String(txt || '').trim();
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits || /^0+$/.test(digits)) return { dpp: null, persen: null, pph: null }; // "0"/kosong = tak ada PPh23
  const t = raw.replace(/\s/g, '');
  const toInt = (s) => { const c = String(s).replace(/[^\d]/g, ''); return c ? parseInt(c, 10) : null; };

  const persenM = t.match(/(\d+(?:[.,]\d+)?)%/);
  const persen = persenM ? Math.round(parseFloat(persenM[1].replace(',', '.'))) : null;

  let pph = null;
  const eq = t.lastIndexOf('=');
  if (eq >= 0) {
    const tail = t.slice(eq + 1).replace(/rp\.?/ig, '');
    const m = tail.match(/\d[\d.]*/);   // angka pertama di ruas kanan '=' (titik = pemisah ribuan)
    if (m) pph = toInt(m[0]);
  }
  if (pph == null) {                    // tak ada '=' → ambil angka terbesar sbg fallback
    const nums = (t.match(/\d[\d.]*/g) || []).map(toInt).filter(Boolean);
    if (nums.length) pph = Math.max(...nums);
  }
  const dpp = (pph != null && persen) ? Math.round(pph / (persen / 100)) : null;
  return { dpp, persen, pph };
}

// Ambil pengajuan yang DIBAYAR dalam periode + nilai keuangan efektif (revision-aware).
async function fetchPaid(year, month) {
  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const to   = new Date(Date.UTC(year, month, 1)).toISOString();  // awal bulan berikutnya (eksklusif)

  const { data: subs, error } = await supabase.from('submissions')
    .select('id, nomor_pengajuan, cabang, cabang_manual, vendor, npwp, rekening_tujuan, jenis_pembelian, alasan, alasan_type, total_harga, ppn, pph23, jumlah_bayar, tanggal, tanggal_bayar, status, revisi_count')
    .not('tanggal_bayar', 'is', null)
    .gte('tanggal_bayar', from).lt('tanggal_bayar', to)
    .order('tanggal_bayar', { ascending: true });
  if (error) throw new Error(error.message);

  // Snapshot revisi TERAKHIR yang disetujui per pengajuan (untuk ppn/pph23/total terbaru).
  const ids = (subs || []).filter(s => s.revisi_count > 0).map(s => s.id);
  const snapBySub = {};
  if (ids.length) {
    const { data: snaps } = await supabase.from('revision_snapshots')
      .select('submission_id, revision_number, ppn, pph23, total_harga')
      .in('submission_id', ids)
      .eq('status', 'disetujui')
      .order('revision_number', { ascending: true });
    for (const sn of snaps || []) snapBySub[sn.submission_id] = sn; // terakhir (tertinggi) menang
  }

  return (subs || []).map(s => {
    const snap  = snapBySub[s.id];
    const ppn   = Number((snap ? snap.ppn : s.ppn) || 0);
    const total = Number((snap ? snap.total_harga : s.total_harga) || 0);
    const pphTxt = (snap ? snap.pph23 : s.pph23) || '';
    const p = parsePph23(pphTxt);
    return {
      tanggal: s.tanggal, tanggal_bayar: s.tanggal_bayar,
      nomor: s.nomor_pengajuan, cabang: s.cabang_manual || s.cabang || '',
      vendor: s.vendor || '', npwp: s.npwp || '',
      jenis: s.jenis_pembelian || '', keterangan: (s.alasan || s.alasan_type || '').trim(),
      rekening: s.rekening_tujuan || '', status: s.status,
      total, ppn, dpp: Math.max(0, total - ppn),
      pph23: p.pph, pph23_persen: p.persen, pph23_dpp: p.dpp, pph23_txt: String(pphTxt).trim(),
      dibayar: Number(s.jumlah_bayar) || 0,
      direvisi: !!snap,
    };
  });
}

const asDate = (iso) => (iso ? new Date(iso) : null);

// ── GET /api/laporan/daftar-transaksi?year=&month= ──────────────
async function daftarTransaksi(req, res) {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || (new Date().getMonth() + 1);
    const rows = await fetchPaid(year, month);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'BAWDI'; wb.created = new Date();
    const ws = wb.addWorksheet('Daftar Transaksi');

    ws.getCell('A1').value = `DAFTAR TRANSAKSI — ${BULAN[month]} ${year}`;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFB45309' } };
    ws.getCell('A2').value = `${rows.length} transaksi dibayar pada periode ini · nilai mengikuti revisi terakhir bila ada`;
    ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF64748B' } };

    const headers = ['Tanggal', 'No. Pengajuan', 'Cabang', 'Vendor', 'NPWP', 'Jenis Pembelian', 'Keterangan',
                     'DPP', 'PPN', 'PPh23', 'Total', 'Dibayar', 'Tgl Bayar', 'Status', 'Rekening'];
    const hr = ws.getRow(3);
    headers.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    let rr = 4;
    for (const r of rows) {
      const row = ws.getRow(rr);
      row.getCell(1).value = asDate(r.tanggal);       row.getCell(1).numFmt = 'dd-mmm-yyyy';
      row.getCell(2).value = r.nomor;
      row.getCell(3).value = r.cabang;
      row.getCell(4).value = r.vendor;
      row.getCell(5).value = r.npwp || '—';
      row.getCell(6).value = r.jenis;
      row.getCell(7).value = r.keterangan;
      row.getCell(8).value = r.dpp;                   row.getCell(8).numFmt = money;
      row.getCell(9).value = r.ppn;                   row.getCell(9).numFmt = money;
      row.getCell(10).value = r.pph23;                row.getCell(10).numFmt = money;
      row.getCell(11).value = r.total;                row.getCell(11).numFmt = money;
      row.getCell(12).value = r.dibayar;              row.getCell(12).numFmt = money;
      row.getCell(13).value = asDate(r.tanggal_bayar); row.getCell(13).numFmt = 'dd-mmm-yyyy';
      row.getCell(14).value = r.status + (r.direvisi ? ' (revisi)' : '');
      row.getCell(15).value = r.rekening;
      for (let c = 1; c <= 15; c++) row.getCell(c).font = { size: 10 };
      rr++;
    }
    // TOTAL berformula
    const tot = ws.getRow(rr);
    tot.getCell(1).value = 'TOTAL';
    [8, 9, 10, 11, 12].forEach(col => {
      const L = String.fromCharCode(64 + col);
      tot.getCell(col).value = rows.length ? { formula: `SUM(${L}4:${L}${rr - 1})` } : 0;
      tot.getCell(col).numFmt = money;
    });
    for (let c = 1; c <= 15; c++) tot.getCell(c).font = { bold: true };

    const widths = [12, 22, 10, 24, 18, 24, 30, 14, 12, 12, 14, 14, 12, 16, 26];
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    if (rows.length) ws.autoFilter = { from: 'A3', to: `O${rr - 1}` };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="BAWDI - Daftar Transaksi ${BULAN[month]} ${year}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[laporan/daftarTransaksi]', err.message);
    res.status(500).json({ error: 'Gagal membuat Daftar Transaksi: ' + err.message });
  }
}

// ── GET /api/laporan/pph23?year=&month= ─────────────────────────
async function rekapPph23(req, res) {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || (new Date().getMonth() + 1);
    const rows = (await fetchPaid(year, month)).filter(r => r.pph23_txt);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'BAWDI'; wb.created = new Date();
    const ws = wb.addWorksheet('Pph23');

    ws.getCell('A1').value = `REKAP PPH23 — ${BULAN[month]} ${year}`;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFB45309' } };
    ws.getCell('A2').value = `${rows.length} pengajuan ber-PPh23 · DPP/%/nilai diurai dari teks; kolom "Teks Asli" untuk verifikasi`;
    ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF64748B' } };

    const headers = ['Tgl Bayar', 'No. Pengajuan', 'Cabang', 'Vendor', 'NPWP', 'Jenis Pembelian', 'DPP PPh23', '%', 'PPh23', 'Total', 'Teks Asli / Keterangan', 'Status'];
    const hr = ws.getRow(3);
    headers.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h; c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    let rr = 4;
    for (const r of rows) {
      const row = ws.getRow(rr);
      row.getCell(1).value = asDate(r.tanggal_bayar); row.getCell(1).numFmt = 'dd-mmm-yyyy';
      row.getCell(2).value = r.nomor;
      row.getCell(3).value = r.cabang;
      row.getCell(4).value = r.vendor;
      row.getCell(5).value = r.npwp || '—';
      row.getCell(6).value = r.jenis;
      row.getCell(7).value = r.pph23_dpp;                                  row.getCell(7).numFmt = money;
      row.getCell(8).value = r.pph23_persen != null ? r.pph23_persen / 100 : null; row.getCell(8).numFmt = '0%';
      row.getCell(9).value = r.pph23;                                      row.getCell(9).numFmt = money;
      row.getCell(10).value = r.total;                                     row.getCell(10).numFmt = money;
      row.getCell(11).value = r.pph23_txt;
      row.getCell(12).value = r.status + (r.direvisi ? ' (revisi)' : '');
      for (let c = 1; c <= 12; c++) row.getCell(c).font = { size: 10 };
      rr++;
    }
    const tot = ws.getRow(rr);
    tot.getCell(1).value = 'TOTAL';
    [7, 9, 10].forEach(col => {
      const L = String.fromCharCode(64 + col);
      tot.getCell(col).value = rows.length ? { formula: `SUM(${L}4:${L}${rr - 1})` } : 0;
      tot.getCell(col).numFmt = money;
    });
    for (let c = 1; c <= 12; c++) tot.getCell(c).font = { bold: true };

    const widths = [12, 22, 10, 24, 18, 24, 14, 6, 14, 14, 38, 16];
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    if (rows.length) ws.autoFilter = { from: 'A3', to: `L${rr - 1}` };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="BAWDI - Rekap PPh23 ${BULAN[month]} ${year}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[laporan/rekapPph23]', err.message);
    res.status(500).json({ error: 'Gagal membuat Rekap PPh23: ' + err.message });
  }
}

module.exports = { daftarTransaksi, rekapPph23 };
