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

// GET /api/messages/unread-map
// SubmissionsPage untuk menandai kartu yang punya pesan baru. Sumbernya
// notifikasi tipe 'new_message' yang belum dibaca (bertahan walau push
// di-dismiss). Ditandai terbaca saat user membuka tab chat (markRead).
async function unreadMap(req, res) {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('submission_id')
      .eq('user_id', req.user.id)
      .eq('type', 'new_message')
      .eq('is_read', false)
      .not('submission_id', 'is', null);
    if (error) throw error;
    const map = {};
    for (const n of data || []) map[n.submission_id] = (map[n.submission_id] || 0) + 1;
    res.json({ data: map });
  } catch (err) {
    console.error('[messages/unread-map]', err);
    res.status(500).json({ error: 'Gagal mengambil status chat' });
  }
}

// PUT /api/messages/:submissionId/read
// Tandai semua notifikasi chat pengajuan ini sebagai terbaca untuk user ini.
async function markRead(req, res) {
  try {
    await supabase.from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.user.id)
      .eq('submission_id', req.params.submissionId)
      .eq('type', 'new_message')
      .eq('is_read', false);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui status chat' });
  }
}

module.exports = { list, send, unreadMap, markRead };
