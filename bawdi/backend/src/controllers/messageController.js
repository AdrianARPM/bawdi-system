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

    // Notifikasi chat → peserta pengajuan + semua Admin (pemantau). Muncul di bell
    // & jadi badge chat di daftar pengajuan. Non-blocking.
    try {
      const senderId   = req.user.id;
      const senderName = data.user?.name || 'Seseorang';
      const nomor      = sub.nomor_pengajuan || 'pengajuan';
      const msg        = `💬 Pesan baru dari ${senderName} · ${nomor}`;

      // Admin selalu ikut agar bisa memantau chat seluruh pengajuan.
      let adminIds = [];
      try {
        const { data: admins } = await supabase.from('users')
          .select('id').eq('role', 'Admin').eq('is_active', true);
        adminIds = (admins || []).map(a => a.id);
      } catch {}

      const directIds = [...new Set([sub.pemohon_id, sub.verifikator_id, sub.approver_id, ...adminIds])]
        .filter(uid => uid && uid !== senderId);
      if (directIds.length) {
        await Promise.all(directIds.map(uid =>
          notifyUser(uid, req.params.submissionId, 'new_message', msg)));
      }
      // Belum ada verifikator/approver ditetapkan → tetap beri tahu Verifikator (role).
      if (!sub.verifikator_id && !sub.approver_id && senderId === sub.pemohon_id) {
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
// Peta {submission_id: jumlah} chat belum dibaca milik user ini — dipakai
// SubmissionsPage untuk menandai kartu yang punya pesan baru. Sumbernya
// notifikasi tipe 'new_message' yang belum dibaca (bertahan walau push
// di-dismiss). Ditandai terbaca saat user membuka tab chat (markRead).
async function unreadMap(req, res) {
  try {
    // Penanda baca per-pengajuan utk user ini (fault-tolerant bila tabel belum ada).
    const readAt = new Map();
    try {
      const { data: reads } = await supabase.from('chat_reads')
        .select('submission_id, last_read_at').eq('user_id', req.user.id);
      for (const r of reads || []) readAt.set(r.submission_id, r.last_read_at);
    } catch { /* tabel chat_reads belum dibuat → anggap belum pernah dibaca */ }

    // Chat (bukan pesan sistem) dari orang lain. Unread = lebih baru dari penanda baca.
    const { data: msgs, error } = await supabase.from('messages')
      .select('submission_id, created_at')
      .eq('is_system', false)
      .neq('user_id', req.user.id)
      .not('submission_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) throw error;

    const map = {};
    for (const m of msgs || []) {
      const last = readAt.get(m.submission_id);
      if (!last || new Date(m.created_at) > new Date(last))
        map[m.submission_id] = (map[m.submission_id] || 0) + 1;
    }
    res.json({ data: map });
  } catch (err) {
    console.error('[messages/unread-map]', err);
    res.status(500).json({ error: 'Gagal mengambil status chat' });
  }
}

// PUT /api/messages/:submissionId/read
// Tandai chat pengajuan ini sebagai terbaca untuk user ini (penanda chat_reads),
// sekaligus bersihkan notifikasi chat di lonceng.
async function markRead(req, res) {
  try {
    const now = new Date().toISOString();
    try {
      await supabase.from('chat_reads').upsert(
        { user_id: req.user.id, submission_id: req.params.submissionId, last_read_at: now },
        { onConflict: 'user_id,submission_id' });
    } catch (e) { console.warn('[messages/markRead] chat_reads dilewati:', e.message); }

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
