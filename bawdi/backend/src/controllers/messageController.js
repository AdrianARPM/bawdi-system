// src/controllers/messageController.js
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Buat notifikasi (muncul di bell) untuk satu user
async function notifyUser(userId, submissionId, type, message) {
  if (!userId) return;
  await supabase.from('notifications').insert({
    id: uuidv4(), user_id: userId, submission_id: submissionId, type, message, is_read: false,
  });
  require('../utils/pushService').sendPushToUser(userId, { body: message, submissionId }).catch(() => {});
}
// Buat notifikasi untuk semua user aktif dengan role tertentu
async function notifyRole(role, submissionId, type, message) {
  const { data: users } = await supabase.from('users')
    .select('id').eq('role', role).eq('is_active', true);
  if (!users?.length) return;
  await supabase.from('notifications').insert(
    users.map(u => ({ id: uuidv4(), user_id: u.id, submission_id: submissionId, type, message, is_read: false }))
  );
  require('../utils/pushService').sendPushToRole(role, { body: message, submissionId }).catch(() => {});
}

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
      .select('pemohon_id, verifikator_id, approver_id, status, nomor_pengajuan')
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

    // Notifikasi chat ke peserta lain — muncul di bell (unread). Non-blocking.
    try {
      const senderId   = req.user.id;
      const senderName = data.user?.name || 'Seseorang';
      const nomor      = sub.nomor_pengajuan || 'pengajuan';
      const msg        = `💬 Pesan baru dari ${senderName} · ${nomor}`;
      const recipients = [...new Set([sub.pemohon_id, sub.verifikator_id, sub.approver_id])]
        .filter(uid => uid && uid !== senderId);
      if (recipients.length) {
        await Promise.all(recipients.map(uid =>
          notifyUser(uid, req.params.submissionId, 'new_message', msg)));
      } else if (senderId === sub.pemohon_id) {
        // Belum ada verifikator/approver ditetapkan → beri tahu Verifikator
        await notifyRole('Verifikator', req.params.submissionId, 'new_message', msg);
      }
    } catch (e) { console.warn('[messages/send] notif dilewati:', e.message); }

    res.status(201).json({ data });
  } catch (err) {
    console.error('[messages/send]', err);
    res.status(500).json({ error: 'Gagal mengirim pesan' });
  }
}

module.exports = { list, send };
