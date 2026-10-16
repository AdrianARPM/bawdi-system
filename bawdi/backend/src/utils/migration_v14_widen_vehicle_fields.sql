-- migration_v14_widen_vehicle_fields.sql
-- Perbaikan "Gagal memperbarui kendaraan": kolom Type/Model (jenis) & Tahun
-- terlalu sempit untuk nilai panjang seperti "Mobil Daihatsu Granmax Box".
-- Pelebaran kolom bersifat aman (non-destruktif, data lama tetap).
-- Jalankan di Supabase SQL Editor.

ALTER TABLE vehicles ALTER COLUMN jenis TYPE VARCHAR(120);
ALTER TABLE vehicles ALTER COLUMN tahun TYPE VARCHAR(20);

SELECT 'vehicles.jenis/tahun diperlebar 🎉' AS status;
