// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes        = require('./routes/auth');
const submissionRoutes  = require('./routes/submissions');
const messageRoutes     = require('./routes/messages');
const notifRoutes       = require('./routes/notifications');
const userRoutes        = require('./routes/users');

const app = express();

// ── Security ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'http://localhost:5173',
  ],
  credentials: true,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' }
});
app.use(limiter);

// ── Parsers ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',          authLimiter, authRoutes);
app.use('/api/submissions',   submissionRoutes);
app.use('/api/messages',      messageRoutes);
app.use('/api/notifications', notifRoutes);
app.use('/api/users',         userRoutes);

// ── Health check ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── 404 handler ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

// ── Error handler ─────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Terjadi kesalahan server' : err.message
  });
});

// ── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🚀  BAWDI API berjalan di http://localhost:${PORT}`);
  console.log(`📋  Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
