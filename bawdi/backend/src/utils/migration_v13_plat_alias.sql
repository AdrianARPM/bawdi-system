-- migration_v13_plat_alias.sql
-- Dukungan "plat kendaraan berganti" (model alias): satu kendaraan tetap satu
-- identitas; plat lama disimpan sebagai plat_sebelumnya (daftar, dipisah koma)
-- agar riwayat KM/item/laporan tetap tersambung melewati pergantian plat.
-- Jalankan di Supabase SQL Editor. Idempoten.

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS plat_sebelumnya VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS plat_ganti_at   TIMESTAMPTZ;

SELECT 'vehicles.plat_sebelumnya siap 🎉' AS status;
