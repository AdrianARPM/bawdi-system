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

module.exports = router;
