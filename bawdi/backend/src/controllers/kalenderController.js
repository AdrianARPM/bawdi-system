// src/controllers/kalenderController.js — v1 (Catatan Kalender Bayar, bersama)
// Catatan per-tanggal di kalender jatuh tempo pembayaran. Bersama untuk yang
// berhak melihat (Admin/Verifikator/Approval). Hapus: pembuat atau Admin.
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

// ── GET /api/kalender/notes?from=YYYY-MM-DD&to=YYYY-MM-DD ────────
async function listNotes(req, res) {
  try {
    const { from, to } = req.query;
    let q = supabase.from('kalender_notes')
      .select('id, tanggal, catatan, dibuat_oleh, dibuat_nama, created_at')
      .order('created_at', { ascending: true });
    if (from) q = q.gte('tanggal', from);
    if (to)   q = q.lte('tanggal', to);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('[kalender/listNotes]', err);
    res.status(500).json({ error: 'Gagal mengambil catatan kalender' });
  }
}

// ── POST /api/kalender/notes  { tanggal, catatan } ──────────────
async function createNote(req, res) {
  try {
    const { tanggal, catatan } = req.body;
    if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal))
      return res.status(400).json({ error: 'Tanggal (YYYY-MM-DD) wajib' });
    if (!catatan || !catatan.trim())
      return res.status(400).json({ error: 'Catatan wajib diisi' });

    const { data, error } = await supabase.from('kalender_notes').insert({
      id: uuidv4(), tanggal, catatan: catatan.trim(),
      dibuat_oleh: req.user.id, dibuat_nama: req.user.name || '',
    }).select().single();
    if (error) throw error;
    res.status(201).json({ message: 'Catatan ditambahkan', data });
  } catch (err) {
    console.error('[kalender/createNote]', err);
    res.status(500).json({ error: 'Gagal menambah catatan' });
  }
}

// ── DELETE /api/kalender/notes/:id  (pembuat atau Admin) ─────────
async function deleteNote(req, res) {
  try {
    const { data: note } = await supabase.from('kalender_notes')
      .select('id, dibuat_oleh').eq('id', req.params.id).single();
    if (!note) return res.status(404).json({ error: 'Catatan tidak ditemukan' });
    if (req.user.role !== 'Admin' && note.dibuat_oleh !== req.user.id)
      return res.status(403).json({ error: 'Hanya pembuat catatan atau Admin yang dapat menghapus' });

    const { error } = await supabase.from('kalender_notes').delete().eq('id', note.id);
    if (error) throw error;
    res.json({ message: 'Catatan dihapus' });
  } catch (err) {
    console.error('[kalender/deleteNote]', err);
    res.status(500).json({ error: 'Gagal menghapus catatan' });
  }
}

module.exports = { listNotes, createNote, deleteNote };
