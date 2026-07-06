// src/index.js  — v7 FIXED
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

const authRoutes       = require('./routes/auth');
const submissionRoutes = require('./routes/submissions');
const messageRoutes    = require('./routes/messages');
const notifRoutes      = require('./routes/notifications');
const userRoutes       = require('./routes/users');
const photoRoutes      = require('./routes/photos');
const revisionRoutes   = require('./routes/revisions');
const vehicleRoutes = require('./routes/vehicles');
const historyRoutes    = require('./routes/history');
const pushRoutes       = require('./routes/push');
const analyticsRoutes  = require('./routes/analytics');
const { startScheduler } = require('./utils/notifScheduler');

const app = express();

app.set('trust proxy', 1);  // wajib untuk Railway (proxy)
app.use(helmet());
app.use(compression());  // gzip respons JSON — payload menyusut ±70-85%
app.use(cors({
  origin(origin, cb) {
    const ok = [process.env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173'].filter(Boolean);
    if (!origin || ok.includes(origin) || /\.vercel\.app$/.test(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(morgan('dev'));

app.use('/api/auth',          authRoutes);
app.use('/api/submissions',   submissionRoutes);
app.use('/api/messages',      messageRoutes);
app.use('/api/notifications', notifRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/photos',        photoRoutes);
app.use('/api/revisions',     revisionRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/history',       historyRoutes);
app.use('/api/push',          pushRoutes);
app.use('/api/analytics',     analyticsRoutes);
// Health check — verifikasi versi yang sedang berjalan
app.get('/health', (_, res) =>
  res.json({ status: 'ok', version: '7.0.0', timestamp: new Date().toISOString() }));

app.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Terjadi kesalahan server' : err.message,
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🚀  BAWDI API v7 — http://localhost:${PORT}`);
  startScheduler();
});
module.exports = app;
