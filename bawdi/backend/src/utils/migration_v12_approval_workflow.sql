-- migration_v12_approval_workflow.sql  (model per-langkah)
-- Alur persetujuan per cabang/project & per tipe dokumen (PR/PAR), DUA langkah
-- yang bisa diatur bebas:
--   verifikasi_aktor : siapa yang memverifikasi  (NULL = langkah verifikasi dilewati)
--   approval_aktor   : siapa yang menyetujui     (NULL = langkah persetujuan dilewati)
-- Aktor valid: 'Verifikator' | 'Approval' | 'Kepala Operasional' | 'HRGA'.
-- Minimal salah satu langkah harus terisi. Pengajuan tetap berakhir di status
-- 'Disetujui'; bila approval_aktor NULL, approver dibiarkan kosong (nama kosong).
--
-- Cabang tanpa baris → default: PR {Verifikator → Approval}, PAR {— → Kepala Operasional}.
-- Jalankan di Supabase SQL Editor. Idempoten.

CREATE TABLE IF NOT EXISTS approval_workflow (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabang           VARCHAR(100) NOT NULL,   -- KODE project (cabang master) = submissions.cabang_manual
  type             VARCHAR(3)   NOT NULL CHECK (type IN ('PR', 'PAR')),
  verifikasi_aktor VARCHAR(32),            -- NULL = lewati verifikasi
  approval_aktor   VARCHAR(32),            -- NULL = lewati persetujuan
  updated_by       UUID REFERENCES users(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_min_satu_langkah CHECK (verifikasi_aktor IS NOT NULL OR approval_aktor IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_workflow
  ON approval_workflow (cabang, type);

SELECT 'approval_workflow (per-langkah) siap 🎉' AS status;
