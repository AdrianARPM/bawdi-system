// src/routes/notifications.js
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

// GET /api/notifications — notifikasi milik user ini
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, message, is_read, created_at, submission_id, submission:submissions(nomor_pengajuan)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil notifikasi' });
  }
});

// PUT /api/notifications/read-all — tandai semua sudah dibaca
router.put('/read-all', async (req, res) => {
  try {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', req.user.id);
    res.json({ message: 'Semua notifikasi telah ditandai dibaca' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui notifikasi' });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req, res) => {
  try {
    await supabase.from('notifications').update({ is_read: true }).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ message: 'Notifikasi ditandai dibaca' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui notifikasi' });
  }
});

module.exports = router;
