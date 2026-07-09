// src/routes/health.js — health check untuk monitoring eksternal (UptimeRobot dll)
// Sengaja TANPA autentikasi agar bisa dipanggil layanan monitor.
// Tidak membocorkan data sensitif — hanya status & latensi.
const router = require('express').Router();
const supabase = require('../../config/supabase');

router.get('/', async (req, res) => {
  const t0 = Date.now();
  let dbStatus = 'ok';
  let dbLatencyMs = null;

  try {
    // Kueri paling ringan: HEAD count 1 baris — cukup untuk membuktikan
    // koneksi Railway → Supabase hidup (kasus "fetch failed" terdeteksi di sini)
    const { error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .limit(1);
    if (error) throw error;
    dbLatencyMs = Date.now() - t0;
  } catch (e) {
    dbStatus = 'error: ' + e.message;
  }

  const ok = dbStatus === 'ok';
  res.status(ok ? 200 : 503).json({
    status:        ok ? 'ok' : 'degraded',
    db:            dbStatus,
    db_latency_ms: dbLatencyMs,
    uptime_s:      Math.round(process.uptime()),
    time:          new Date().toISOString(),
  });
});

// ── Detail untuk panel Status Sistem (khusus Admin) ─────────────
const { authenticate, authorize } = require('../middleware/auth');
const { getLastRunAt } = require('../utils/notifScheduler');

router.get('/detail', authenticate, authorize('Admin'), async (req, res) => {
  try {
    // Latensi DB
    const t0 = Date.now();
    let dbStatus = 'ok', dbLatencyMs = null;
    try {
      const { error } = await supabase.from('users').select('id', { count: 'exact', head: true }).limit(1);
      if (error) throw error;
      dbLatencyMs = Date.now() - t0;
    } catch (e) { dbStatus = 'error: ' + e.message; }

    const since24h     = new Date(Date.now() - 24 * 3600e3).toISOString();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600e3).toISOString();

    const [emailRows, pushCount, verifCount, apprCount, notaCount] = await Promise.all([
      supabase.from('email_logs').select('type').gte('created_at', since24h).limit(2000),
      supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }),
      supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('status', 'Menunggu Verifikasi').lt('tanggal', threeDaysAgo),
      supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('status', 'Terverifikasi').lt('tanggal', threeDaysAgo),
      supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('status', 'Disetujui').is('nota_url', null),
    ]);

    const byType = {};
    (emailRows.data || []).forEach(r => {
      const k = r.type || 'lainnya';
      byType[k] = (byType[k] || 0) + 1;
    });

    res.json({
      status:        dbStatus === 'ok' ? 'ok' : 'degraded',
      db:            dbStatus,
      db_latency_ms: dbLatencyMs,
      uptime_s:      Math.round(process.uptime()),
      time:          new Date().toISOString(),
      scheduler:     { last_run: getLastRunAt() },
      push: {
        devices: pushCount.count || 0,
        vapid:   !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      },
      email_24h: { total: (emailRows.data || []).length, by_type: byType },
      queue: {
        menunggu_verifikasi: verifCount.count || 0,
        menunggu_persetujuan: apprCount.count || 0,
        belum_nota: notaCount.count || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil status: ' + err.message });
  }
});

// ── Log audit — 50 terakhir (Admin) ─────────────────────────────
router.get('/audit', authenticate, authorize('Admin'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, user_name, action, target, submission_id, detail, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil log audit: ' + err.message });
  }
});

module.exports = router;
