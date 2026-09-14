-- ═══════════════════════════════════════════════════════════════
--  BAWDI v6 — Migration: kolom `tahun` di Master Kendaraan
--  Jalankan di: Supabase → SQL Editor → New Query → Run
--  Tujuan: simpan Type (kolom `jenis` yg sudah ada) + Tahun terpisah,
--          supaya field "Type" di form pengajuan bisa terisi otomatis
--          saat plat dipilih (mis. "Revo 2010").
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS tahun VARCHAR(10) NOT NULL DEFAULT '';

SELECT 'Migration v6 (kolom tahun kendaraan) berhasil! 🎉' AS status;
