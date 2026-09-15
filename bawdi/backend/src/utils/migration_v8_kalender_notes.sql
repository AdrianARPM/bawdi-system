-- ═══════════════════════════════════════════════════════════════
--  BAWDI v8 — Migration: Catatan Kalender Bayar (bersama)
--  Jalankan di: Supabase → SQL Editor → New Query → Run
--  Tujuan: catatan per-tanggal di Kalender Jatuh Tempo Pembayaran.
--          Bersama (semua yg berhak melihat kalender melihatnya).
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS kalender_notes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tanggal     DATE         NOT NULL,             -- tanggal yang dicatat (YYYY-MM-DD)
  catatan     TEXT         NOT NULL,
  dibuat_oleh UUID         REFERENCES users(id),
  dibuat_nama VARCHAR(100) NOT NULL DEFAULT '',  -- snapshot nama penulis
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kalender_notes_tanggal ON kalender_notes(tanggal);

ALTER TABLE kalender_notes DISABLE ROW LEVEL SECURITY;

SELECT 'Migration v8 (catatan kalender) berhasil! 🎉' AS status;
