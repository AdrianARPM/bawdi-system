// src/routes/backup.js — export data ke Excel/JSON dari halaman Status Sistem (Admin)
// Pelengkap backup pg_dump GitHub Actions: unduhan cepat yang bisa dibaca manusia.
//
// Keamanan:
// - Hanya Admin.
// - Kolom sensitif TIDAK diexport: password_hash (users), p256dh/auth (push) —
//   tabel push_subscriptions & notifications sengaja dilewati (ephemeral/berisi kunci perangkat).
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const supabase = require('../../config/supabase');
const ExcelJS = require('exceljs');

router.use(authenticate, authorize('Admin'));

// Tabel yang diexport + kolomnya ('*' = semua kolom, aman untuk tabel non-sensitif)
const TABLES = [
  { name: 'users', select: 'id, nik, name, role, jabatan, cabang, is_active, email, email_notif, last_login, created_at' },
  { name: 'submissions',             select: '*' },
  { name: 'submission_items',        select: '*' },
  { name: 'revision_snapshots',      select: '*' },
  { name: 'revision_snapshot_items', select: '*' },
  { name: 'messages',                select: '*' },
  { name: 'vehicles',                select: '*' },
  { name: 'kas_kecil',               select: '*' },
];

const PAGE = 1000;
const MAX_ROWS = 20000; // pagar per tabel

async function fetchAll(table, select) {
  const rows = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from(table).select(select)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      // beberapa tabel mungkin tak punya created_at — coba tanpa order
      const retry = await supabase.from(table).select(select).range(from, from + PAGE - 1);
      if (retry.error) throw new Error(`${table}: ${retry.error.message}`);
      rows.push(...(retry.data || []));
      if (!retry.data || retry.data.length < PAGE) break;
      continue;
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function stamp() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
}

// GET /api/backup/export?format=json — seluruh tabel dalam satu file JSON
// GET /api/backup/export?format=xlsx — Excel multi-sheet (default)
router.get('/export', async (req, res) => {
  try {
    const format = (req.query.format || 'xlsx').toLowerCase();

    const result = {};
    for (const t of TABLES) result[t.name] = await fetchAll(t.name, t.select);

    if (format === 'json') {
      const payload = {
        exported_at: new Date().toISOString(),
        exported_by: req.user.name || req.user.id,
        note: 'Export data BAWDI. password_hash & kunci push tidak disertakan.',
        tables: result,
      };
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="bawdi_export_${stamp()}.json"`);
      return res.send(JSON.stringify(payload, null, 1));
    }

    // Excel multi-sheet
    const wb = new ExcelJS.Workbook();
    wb.created = new Date();
    for (const t of TABLES) {
      const rows = result[t.name];
      const ws = wb.addWorksheet(t.name.slice(0, 31));
      if (!rows.length) { ws.addRow(['(kosong)']); continue; }
      const headers = Object.keys(rows[0]);
      ws.addRow(headers).font = { bold: true };
      for (const r of rows) {
        ws.addRow(headers.map(h => {
          const v = r[h];
          return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
        }));
      }
      ws.columns.forEach(c => { c.width = 18; });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bawdi_export_${stamp()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[backup/export]', err.message);
    res.status(500).json({ error: 'Gagal membuat export: ' + err.message });
  }
});

// ── GET /api/backup/export-pph23 — rekap Pph23 (Excel), kolom terurai dari teks ──
function parsePph23(txt) {
  const t = String(txt).replace(/\s/g, '');
  const toInt = (s) => {
    const c = s.replace(/[.,-]/g, '');
    return /^\d+$/.test(c) ? parseInt(c, 10) : null;
  };
  // Pola A: "Rp DPP x N% = Rp PPH"  (mis. Rp.350.000,- x 2% = Rp.7.000,-)
  let m = t.match(/([\d.]+),?-?x(\d+)%=(?:Rp\.?)?([\d.]+)/i);
  if (m) return { dpp: toInt(m[1]), persen: parseInt(m[2], 10), pph: toInt(m[3]) };
  // Pola B: "N% x DPP = PPH"  (mis. 2% x 200.000., = 4.000)
  m = t.match(/(\d+)%x([\d.]+)[.,-]*=([\d.]+)/i);
  if (m) return { dpp: toInt(m[2]), persen: parseInt(m[1], 10), pph: toInt(m[3]) };
  return { dpp: null, persen: null, pph: null };
}

router.get('/export-pph23', async (req, res) => {
  try {
    const rows = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      const { data, error } = await supabase.from('submissions')
        .select('nomor_pengajuan, type, jenis_pembelian, cabang, cabang_manual, vendor, npwp, tanggal, tanggal_bayar, status, pph23')
        .neq('pph23', '')
        .order('nomor_pengajuan', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }

    const wb = new ExcelJS.Workbook();
    wb.created = new Date();
    const ws = wb.addWorksheet('Pph23');

    ws.getCell('A1').value = 'DATA PPH23';
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFB45309' } };
    ws.getCell('A2').value = `${rows.length} pengajuan dengan Pph23 · DPP/%/Pph23 diurai dari teks; kolom "Teks Asli" untuk verifikasi`;
    ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF64748B' } };

    const headers = ['No. Pengajuan', 'Tipe', 'Jenis Pembelian', 'Cabang', 'Vendor', 'NPWP/KTP', 'Tanggal Pengajuan', 'Tanggal Bayar', 'Status', 'DPP (Rp)', '%', 'Pph23 (Rp)', 'Teks Asli'];
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
      const p = parsePph23(r.pph23);
      const row = ws.getRow(rr);
      const vals = [
        r.nomor_pengajuan, r.type, r.jenis_pembelian || '', r.cabang_manual || r.cabang || '',
        r.vendor || '', r.npwp || '—',
        (r.tanggal || '').slice(0, 10), (r.tanggal_bayar || '').slice(0, 10) || '—',
        r.status, p.dpp, p.persen != null ? p.persen / 100 : null, p.pph, String(r.pph23).trim(),
      ];
      vals.forEach((v, i) => { row.getCell(i + 1).value = v; row.getCell(i + 1).font = { size: 10 }; });
      row.getCell(10).numFmt = '#,##0';
      row.getCell(11).numFmt = '0%';
      row.getCell(12).numFmt = '#,##0';
      rr++;
    }
    // TOTAL berformula
    const tot = ws.getRow(rr);
    tot.getCell(1).value = 'TOTAL';
    tot.getCell(10).value = { formula: `SUM(J4:J${rr - 1})` };
    tot.getCell(12).value = { formula: `SUM(L4:L${rr - 1})` };
    [1, 10, 12].forEach(i => { tot.getCell(i).font = { bold: true }; });
    tot.getCell(10).numFmt = '#,##0';
    tot.getCell(12).numFmt = '#,##0';

    const widths = [22, 7, 26, 10, 26, 20, 15, 14, 13, 14, 7, 14, 38];
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    ws.autoFilter = { from: 'A3', to: `M${rr - 1}` };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bawdi_pph23_${stamp()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[backup/export-pph23]', err.message);
    res.status(500).json({ error: 'Gagal membuat export Pph23: ' + err.message });
  }
});

module.exports = router;
