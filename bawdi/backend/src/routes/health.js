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

module.exports = router;
