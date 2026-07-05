// src/routes/push.js — kelola langganan Web Push per user
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate);

// GET /api/push/vapid-public-key — kunci publik untuk PushManager.subscribe di frontend
router.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});

// POST /api/push/subscribe — simpan/refresh subscription perangkat ini
router.post('/subscribe', async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth)
      return res.status(400).json({ error: 'Subscription tidak valid' });

    const { error } = await supabase.from('push_subscriptions').upsert({
      id:       uuidv4(),
      user_id:  req.user.id,
      endpoint: subscription.endpoint,
      p256dh:   subscription.keys.p256dh,
      auth:     subscription.keys.auth,
    }, { onConflict: 'endpoint' });

    if (error) throw error;
    res.json({ message: 'Notifikasi perangkat diaktifkan' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyimpan subscription: ' + err.message });
  }
});

// POST /api/push/unsubscribe — hapus subscription perangkat ini
router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Endpoint wajib diisi' });
    await supabase.from('push_subscriptions')
      .delete().eq('endpoint', endpoint).eq('user_id', req.user.id);
    res.json({ message: 'Notifikasi perangkat dimatikan' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus subscription: ' + err.message });
  }
});

module.exports = router;
