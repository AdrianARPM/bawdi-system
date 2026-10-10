// src/controllers/workflowController.js — v2 (model per-langkah)
// Kelola alur verifikasi/persetujuan per cabang/project (PR & PAR). Admin-only.
// Cabang tanpa baris = default. Tiap baris menyimpan 2 aktor (boleh salah satu null).
const supabase = require('../../config/supabase');
const { AKTOR, DEFAULT_FLOW, normType } = require('../utils/workflow');

const validAktor = (a) => a === null || a === undefined || a === '' || AKTOR.includes(a);
const clean = (a) => (a && AKTOR.includes(a) ? a : null);

// ── GET /api/workflow ───────────────────────────────────────────
// Dikunci pada CABANG/PROJECT yang diajukan (kode cabang master = pilihan
// dropdown di form pengajuan, tersimpan sebagai submissions.cabang_manual) —
// bukan cabang asal user. Satu baris per kode cabang; PR/PAR = {verifikasi,
// approval} bila dikonfig, atau null bila memakai default.
async function list(req, res) {
  try {
    const nama = new Map();   // kode → nama (untuk tampilan)
    const order = new Map();  // kode → urutan tampil
    const set = new Set();
    const { data: cabs } = await supabase.from('cabang').select('kode, nama, is_active, urutan');
    (cabs || []).forEach((c, i) => {
      const k = (c.kode || '').trim(); if (!k) return;
      set.add(k); nama.set(k, c.nama || ''); order.set(k, c.urutan ?? (1000 + i));
    });

    let cfg = [];
    try { ({ data: cfg } = await supabase.from('approval_workflow')
      .select('cabang, type, verifikasi_aktor, approval_aktor')); }
    catch { cfg = []; }
    const cfgMap = new Map();  // kode → { PR:{...}, PAR:{...} }
    for (const c of cfg || []) {
      const m = cfgMap.get(c.cabang) || {};
      m[c.type] = { verifikasi: c.verifikasi_aktor || null, approval: c.approval_aktor || null };
      cfgMap.set(c.cabang, m);
      set.add(c.cabang);  // kode di config yg mungkin sudah tak ada di master
    }

    const data = [...set]
      .sort((a, b) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999) || a.localeCompare(b))
      .map((cabang) => {
        const m = cfgMap.get(cabang) || {};
        return { cabang, nama: nama.get(cabang) || '', PR: m.PR || null, PAR: m.PAR || null };
      });

    res.json({ data, aktor: AKTOR, default: DEFAULT_FLOW });
  } catch (err) {
    console.error('[workflow/list]', err);
    res.status(500).json({ error: 'Gagal mengambil pengaturan alur' });
  }
}

// ── PUT /api/workflow ───────────────────────────────────────────
// Body: { cabang, type:'PR'|'PAR', verifikasi_aktor, approval_aktor }.
// Kedua aktor null → kembali ke default (baris dihapus).
async function upsert(req, res) {
  try {
    const cabang = (req.body.cabang || '').trim();
    const type   = normType(req.body.type);
    if (!cabang) return res.status(400).json({ error: 'Cabang wajib diisi' });
    if (!validAktor(req.body.verifikasi_aktor) || !validAktor(req.body.approval_aktor))
      return res.status(400).json({ error: 'Aktor tidak dikenal' });

    const verifikasi_aktor = clean(req.body.verifikasi_aktor);
    const approval_aktor   = clean(req.body.approval_aktor);

    if (!verifikasi_aktor && !approval_aktor) {
      await supabase.from('approval_workflow').delete().eq('cabang', cabang).eq('type', type);
      return res.json({ message: `Alur ${type} untuk ${cabang} dikembalikan ke default` });
    }

    const { error } = await supabase.from('approval_workflow').upsert(
      { cabang, type, verifikasi_aktor, approval_aktor, updated_by: req.user.id, updated_at: new Date().toISOString() },
      { onConflict: 'cabang,type' },
    );
    if (error) throw error;

    const ket = `${verifikasi_aktor || '— (lewati)'} → ${approval_aktor || '— (lewati, nama approver kosong)'}`;
    res.json({ message: `Alur ${type} untuk ${cabang}: ${ket}` });
  } catch (err) {
    console.error('[workflow/upsert]', err);
    res.status(500).json({ error: 'Gagal menyimpan pengaturan alur' });
  }
}

module.exports = { list, upsert };
