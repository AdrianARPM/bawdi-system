-- ═══════════════════════════════════════════════════════════════
--  BAWDI v7 — Migration: Usulan Revisi oleh Pemohon
--  Jalankan di: Supabase → SQL Editor → New Query → Run
--  Tujuan: pemohon bisa MENGAJUKAN permintaan revisi + alasan (mirip
--          request pembayaran). Muncul sebagai kartu di dashboard
--          Verifikator/Approval/Admin. Berbeda dari `revisi_diminta_*`
--          yang dipakai arah sebaliknya (approver membuka revisi).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS usul_revisi_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS usul_revisi_oleh   UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS usul_revisi_alasan TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_submissions_usul_revisi
  ON submissions(usul_revisi_at);

SELECT 'Migration v7 (usulan revisi pemohon) berhasil! 🎉' AS status;
