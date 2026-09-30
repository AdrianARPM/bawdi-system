-- ═══════════════════════════════════════════════════════════════
--  BAWDI v9 — Migration: Request Pelunasan (sisa setelah DP)
--  Jalankan di: Supabase → SQL Editor → New Query → Run
--  Tujuan: pemohon bisa MENGAJUKAN pelunasan sisa setelah DP dibayar
--          (mirip request pembayaran). Muncul sbg kartu di dashboard
--          Verifikator/Approval/Admin. Terpisah dari `bayar_diminta_at`.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS pelunasan_diminta_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pelunasan_diminta_oleh UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_submissions_pelunasan
  ON submissions(pelunasan_diminta_at);

SELECT 'Migration v9 (request pelunasan) berhasil! 🎉' AS status;
