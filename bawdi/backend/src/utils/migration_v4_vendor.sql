-- ═══════════════════════════════════════════════════════════════
--  BAWDI v4 — Migration: Master Vendor / Supplier
--  Jalankan di: Supabase → SQL Editor → New Query → Run
--  Tujuan: satu sumber data vendor (nama, NPWP, rekening) supaya tidak
--          diketik ulang tiap pengajuan → mengurangi typo & inkonsistensi.
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── TABEL: vendors ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nama        VARCHAR(200) NOT NULL,
  npwp        VARCHAR(40)  NOT NULL DEFAULT '',   -- NPWP / KTP
  bank        VARCHAR(50)  NOT NULL DEFAULT '',   -- mis. BCA, Mandiri
  no_rekening VARCHAR(50)  NOT NULL DEFAULT '',
  atas_nama   VARCHAR(150) NOT NULL DEFAULT '',   -- nama pemilik rekening
  telepon     VARCHAR(30)  NOT NULL DEFAULT '',
  alamat      TEXT         NOT NULL DEFAULT '',
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Cegah nama vendor ganda (case-insensitive): "CV Maju" vs "cv maju".
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_nama_lower ON vendors (lower(nama));
CREATE INDEX IF NOT EXISTS idx_vendors_active ON vendors(is_active, nama);

-- ── Auto-update updated_at (pakai fungsi dari schema.sql) ──────
DROP TRIGGER IF EXISTS trg_vendors_updated ON vendors;
CREATE TRIGGER trg_vendors_updated BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Akses via Service Key (backend) — RLS off, sama spt tabel lain ──
ALTER TABLE vendors DISABLE ROW LEVEL SECURITY;

-- ── SEED (opsional): tarik nama vendor unik dari pengajuan lama ──
-- Supaya master langsung terisi dari data yang sudah ada. NPWP diambil
-- dari salah satu pengajuan yg memakainya (kalau ada). Aman diulang.
INSERT INTO vendors (nama, npwp)
SELECT DISTINCT ON (lower(trim(vendor)))
       trim(vendor)          AS nama,
       COALESCE(npwp, '')     AS npwp
FROM submissions
WHERE vendor IS NOT NULL AND trim(vendor) <> ''
ORDER BY lower(trim(vendor)), tanggal DESC
ON CONFLICT (lower(nama)) DO NOTHING;

SELECT 'Migration v4 (Master Vendor) berhasil! 🎉' AS status;
