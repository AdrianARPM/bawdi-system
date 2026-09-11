-- ═══════════════════════════════════════════════════════════════
--  BAWDI v5 — Migration: Master Jenis Pembelian (Beban)
--  Jalankan di: Supabase → SQL Editor → New Query → Run
--  Tujuan: pindahkan daftar jenis pembelian + aturan "PPh23 wajib" dari
--          hardcode (yg tersebar di frontend & backend) ke satu tabel.
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── TABEL: jenis_pembelian ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS jenis_pembelian (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nama          VARCHAR(200) NOT NULL,
  for_kendaraan BOOLEAN      NOT NULL DEFAULT FALSE, -- muncul saat pengajuan kendaraan
  for_umum      BOOLEAN      NOT NULL DEFAULT FALSE, -- muncul saat pengajuan umum/kantor
  pph23_wajib   BOOLEAN      NOT NULL DEFAULT FALSE, -- mewajibkan pengisian PPh23
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  urutan        SMALLINT     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_jenis_nama_lower ON jenis_pembelian (lower(nama));
CREATE INDEX IF NOT EXISTS idx_jenis_active ON jenis_pembelian(is_active, urutan);

DROP TRIGGER IF EXISTS trg_jenis_updated ON jenis_pembelian;
CREATE TRIGGER trg_jenis_updated BEFORE UPDATE ON jenis_pembelian
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE jenis_pembelian DISABLE ROW LEVEL SECURITY;

-- ── SEED: gabungan JENIS_KENDARAAN + JENIS_UMUM + PPH23_WAJIB lama ──
INSERT INTO jenis_pembelian (nama, for_kendaraan, for_umum, pph23_wajib, urutan)
SELECT nama, fk, fu, pph, ord FROM (VALUES
  ('Beban Suku Cadang',                        TRUE,  FALSE, FALSE, 1),
  ('Beban Perbaikan',                          TRUE,  FALSE, TRUE,  2),
  ('Beban Perawatan',                          TRUE,  FALSE, TRUE,  3),
  ('Beban Perbaikan dan Suku Cadang',          TRUE,  FALSE, TRUE,  4),
  ('Beban Perawatan dan Suku Cadang',          TRUE,  FALSE, TRUE,  5),
  ('Beban Perlengkapan Kendaraan',             TRUE,  TRUE,  FALSE, 6),
  ('Beban Perbaikan dan Perlengkapan Kendaraan',TRUE, FALSE, TRUE,  7),
  ('Beban Perbaikan Box',                      TRUE,  FALSE, TRUE,  8),
  ('Beban Pengiriman Barang',                  TRUE,  TRUE,  FALSE, 9),
  ('Beban Izin Kendaraan',                     TRUE,  TRUE,  FALSE, 10),
  ('Beban Parkir',                             TRUE,  TRUE,  FALSE, 11),
  ('Beban BBM',                                TRUE,  FALSE, FALSE, 12),
  ('Beban Dana Sosial',                        FALSE, TRUE,  FALSE, 13),
  ('Beban Sewa Kendaraan',                     FALSE, TRUE,  TRUE,  14),
  ('Beban Entertain',                          FALSE, TRUE,  FALSE, 15),
  ('Beban Internet',                           FALSE, TRUE,  FALSE, 16),
  ('Beban ATK',                                FALSE, TRUE,  FALSE, 17),
  ('Beban Rumah Tangga Kantor',                FALSE, TRUE,  FALSE, 18),
  ('Beban Bongkar',                            FALSE, TRUE,  FALSE, 19)
) AS seed(nama, fk, fu, pph, ord)
ON CONFLICT (lower(nama)) DO NOTHING;

SELECT 'Migration v5 (Master Jenis Pembelian) berhasil! 🎉' AS status;
