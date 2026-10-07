-- ═══════════════════════════════════════════════════════════════
--  BAWDI v10 — Migration: Master Item (katalog layanan/sparepart)
--  Jalankan di: Supabase → SQL Editor → New Query → Run
--  Tujuan: katalog "item dasar" (mis. "Oli Mesin", "Ban Luar Belakang")
--          supaya riwayat disambung via ID (anti-typo/anti-revisi) dan
--          form pengajuan jadi pilih-dari-daftar. Merek/detail tetap bebas.
--  Scope: cabang NULL = global (dikelola Admin); kode cabang = khusus cabang
--         (boleh ditambah Operasional cabang tsb).
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS master_item (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nama            VARCHAR(150) NOT NULL,                 -- item dasar (tanpa merek)
  kategori_biaya  VARCHAR(50)  NOT NULL DEFAULT 'Lainnya', -- Sewa/Service/Ban/Izin Kendaraan/Jasa/Lainnya
  jenis_kendaraan VARCHAR(20)  NOT NULL DEFAULT 'umum',  -- 'motor' | 'mobil' | 'umum'
  cabang          VARCHAR(20),                           -- NULL = global; kode cabang = khusus cabang
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  dibuat_oleh     UUID         REFERENCES users(id),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Cegah duplikat dalam scope yang sama (nama + tipe kendaraan + cabang).
-- COALESCE agar NULL (global) dianggap satu nilai.
CREATE UNIQUE INDEX IF NOT EXISTS uq_master_item
  ON master_item (lower(nama), jenis_kendaraan, COALESCE(cabang, ''));
CREATE INDEX IF NOT EXISTS idx_master_item_active ON master_item(is_active, jenis_kendaraan);

DROP TRIGGER IF EXISTS trg_master_item_updated ON master_item;
CREATE TRIGGER trg_master_item_updated BEFORE UPDATE ON master_item
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE master_item DISABLE ROW LEVEL SECURITY;

SELECT 'Migration v10 (Master Item) berhasil! 🎉' AS status;
