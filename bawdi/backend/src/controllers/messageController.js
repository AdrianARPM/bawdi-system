// src/controllers/messageController.js
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

// GET /api/messages/:submissionId
async function list(req, res) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id, message, is_system, created_at, user:users(id, name, avatar_initials, role)')
      .eq('submission_id', req.params.submissionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil pesan' });
  }
}

// POST /api/messages/:submissionId
async function send(req, res) {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Pesan tidak boleh kosong' });

    // Pastikan user punya akses ke submission ini
    const { data: sub } = await supabase.from('submissions')
      .select('pemohon_id, verifikator_id, approver_id, status')
      .eq('id', req.params.submissionId).single();

    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    const { data, error } = await supabase.from('messages').insert({
      id: uuidv4(),
      submission_id: req.params.submissionId,
      user_id: req.user.id,
      message: message.trim(),
      is_system: false,
    }).select('id, message, is_system, created_at, user:users(id, name, avatar_initials, role)').single();

    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    console.error('[messages/send]', err);
    res.status(500).json({ error: 'Gagal mengirim pesan' });
  }
}

module.exports = { list, send };
