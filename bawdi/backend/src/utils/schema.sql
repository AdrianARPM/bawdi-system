-- ═══════════════════════════════════════════════════════════════════════════
--  BAWDI MAINTENANCE SYSTEM — Database Schema
--  Jalankan di: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ENUM types ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('Operasional', 'Verifikator', 'Approval', 'Admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE submission_type AS ENUM ('PR', 'PAR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE submission_status AS ENUM (
    'Menunggu Verifikasi', 'Terverifikasi', 'Disetujui', 'Ditolak'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE notif_type AS ENUM (
    'new_submission', 'need_approval', 'approved', 'rejected', 'overdue', 'message'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── TABLE: users ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nik               VARCHAR(20)  NOT NULL UNIQUE,
  name              VARCHAR(100) NOT NULL,
  role              user_role    NOT NULL DEFAULT 'Operasional',
  jabatan           VARCHAR(100) NOT NULL DEFAULT '',
  cabang            VARCHAR(100) NOT NULL DEFAULT '',
  password_hash     TEXT         NOT NULL,
  avatar_initials   VARCHAR(3)   NOT NULL DEFAULT '?',
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN   NOT NULL DEFAULT TRUE,
  last_login        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── TABLE: submissions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submissions (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nomor_pengajuan        VARCHAR(50)  NOT NULL UNIQUE,
  type                   submission_type NOT NULL,
  status                 submission_status NOT NULL DEFAULT 'Menunggu Verifikasi',

  -- Pemohon
  pemohon_id             UUID NOT NULL REFERENCES users(id),
  cabang                 VARCHAR(100) NOT NULL,
  kendaraan              VARCHAR(50)  NOT NULL,
  vendor                 VARCHAR(200) NOT NULL,
  jenis_pembelian        VARCHAR(200) NOT NULL DEFAULT '',
  npwp                   VARCHAR(30)  DEFAULT '',

  -- Isi
  alasan                 TEXT NOT NULL DEFAULT '',
  riwayat                TEXT NOT NULL DEFAULT '',
  total_harga            NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Batas waktu
  batas_waktu_dana       VARCHAR(50)  DEFAULT '',
  batas_akhir_pembayaran DATE,

  -- Alur approval
  verifikator_id         UUID REFERENCES users(id),
  approver_id            UUID REFERENCES users(id),
  verifikasi_at          TIMESTAMPTZ,
  approval_at            TIMESTAMPTZ,
  alasan_tolak           TEXT,

  -- Timestamps
  tanggal                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TABLE: submission_items ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submission_items (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id  UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  penjelasan     TEXT         NOT NULL,
  satuan         VARCHAR(50)  NOT NULL DEFAULT '1 Kali',
  harga          NUMERIC(15,2) NOT NULL DEFAULT 0,
  total          NUMERIC(15,2) NOT NULL DEFAULT 0,
  urutan         SMALLINT     NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── TABLE: messages ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id  UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id),
  message        TEXT    NOT NULL,
  is_system      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TABLE: notifications ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id  UUID REFERENCES submissions(id) ON DELETE SET NULL,
  type           notif_type NOT NULL,
  message        TEXT NOT NULL,
  is_read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_submissions_pemohon    ON submissions(pemohon_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status     ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_tanggal    ON submissions(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_items_submission       ON submission_items(submission_id);
CREATE INDEX IF NOT EXISTS idx_messages_submission    ON messages(submission_id);
CREATE INDEX IF NOT EXISTS idx_notifs_user            ON notifications(user_id, is_read);

-- ── AUTO UPDATE updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_submissions_updated ON submissions;
CREATE TRIGGER trg_submissions_updated BEFORE UPDATE ON submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── ROW LEVEL SECURITY (Supabase) ─────────────────────────────────────────────
-- Semua akses via Service Key (backend) — RLS dinonaktifkan untuk tabel ini
-- karena autentikasi ditangani oleh Express JWT middleware
ALTER TABLE users          DISABLE ROW LEVEL SECURITY;
ALTER TABLE submissions    DISABLE ROW LEVEL SECURITY;
ALTER TABLE submission_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages       DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications  DISABLE ROW LEVEL SECURITY;

-- ── SEED: Admin default ────────────────────────────────────────────────────────
-- Password: 'admin123' (bcrypt hash)
-- GANTI setelah login pertama!
INSERT INTO users (id, nik, name, role, jabatan, cabang, password_hash, avatar_initials, must_change_password)
VALUES (
  uuid_generate_v4(),
  '10000',
  'Admin BAWDI',
  'Admin',
  'System Administrator',
  'Head Office',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeAiZ6Z6uN8c5lD5G', -- admin123
  'AB',
  TRUE
) ON CONFLICT (nik) DO NOTHING;

SELECT 'Schema berhasil dibuat! 🎉' AS status;
