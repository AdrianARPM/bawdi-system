-- ═══════════════════════════════════════════════════════════════
--  BAWDI v3 — Migration: Master Cabang / Project
--  Jalankan di: Supabase → SQL Editor → New Query → Run
--  Tujuan: pindahkan daftar cabang dari hardcode (frontend) ke DB,
--          jadi satu sumber kebenaran untuk user, kendaraan & pengajuan.
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── TABEL: cabang ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cabang (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kode        VARCHAR(20)  NOT NULL UNIQUE,     -- mis. APLPKU (dipakai di nomor pengajuan)
  nama        VARCHAR(150) NOT NULL DEFAULT '', -- nama lengkap cabang/project
  alamat      TEXT         NOT NULL DEFAULT '',
  pic         VARCHAR(100) NOT NULL DEFAULT '', -- penanggung jawab
  telepon     VARCHAR(30)  NOT NULL DEFAULT '',
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  urutan      SMALLINT     NOT NULL DEFAULT 0,  -- urutan tampil di dropdown
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cabang_active ON cabang(is_active, urutan);

-- ── Auto-update updated_at (pakai fungsi yg sudah ada dari schema.sql) ──
DROP TRIGGER IF EXISTS trg_cabang_updated ON cabang;
CREATE TRIGGER trg_cabang_updated BEFORE UPDATE ON cabang
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Akses via Service Key (backend) — RLS off, sama spt tabel lain ──
ALTER TABLE cabang DISABLE ROW LEVEL SECURITY;

-- ── SEED: 17 kode cabang lama (dari CABANG_LIST frontend) ──────
-- nama/alamat/pic dikosongkan → admin lengkapi lewat halaman Master Cabang.
INSERT INTO cabang (kode, urutan)
SELECT kode, ord FROM (VALUES
  ('APLPKU', 1),  ('APLBDO', 2),  ('APLPDG', 3),  ('APLDJB', 4),
  ('APLMES', 5),  ('APLPLM', 6),  ('PVPLM', 7),   ('PVMES', 8),
  ('PVPKU', 9),   ('PVTKG', 10),  ('PVSUB', 11),  ('PVMLG', 12),
  ('DHSCBT', 13), ('NIC', 14),    ('MTKA', 15),   ('ADM', 16)
) AS seed(kode, ord)
ON CONFLICT (kode) DO NOTHING;

SELECT 'Migration v3 (Master Cabang) berhasil! 🎉' AS status;
