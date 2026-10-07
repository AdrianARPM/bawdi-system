-- ═══════════════════════════════════════════════════════════════
--  BAWDI v11 — Migration: kategori kendaraan (motor/mobil)
--  Jalankan di: Supabase → SQL Editor → New Query → Run
--  Tujuan: menandai tiap kendaraan sebagai 'motor' atau 'mobil' agar
--          dropdown Master Item di form bisa disaring sesuai tipe.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS kategori VARCHAR(10) NOT NULL DEFAULT '';  -- 'motor' | 'mobil' | '' (belum diisi)

SELECT 'Migration v11 (kategori kendaraan) berhasil! 🎉' AS status;
