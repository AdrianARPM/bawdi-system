-- ═══════════════════════════════════════════════════════════════
--  BAWDI v2 — Migration: Dual Vendor + Photo Upload + Notifikasi
--  Jalankan di: Supabase → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

-- ── 1. TAMBAH KOLOM VENDOR KEDUA di tabel submissions ──────────
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS vendor2             VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS npwp2               VARCHAR(30)  DEFAULT '',
  ADD COLUMN IF NOT EXISTS vendor2_selected    BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vendor_pilihan      SMALLINT     DEFAULT NULL, -- 1 atau 2
  ADD COLUMN IF NOT EXISTS vendor_pilihan_alasan TEXT        DEFAULT '';

-- ── 2. TABEL FOTO LAMPIRAN ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS submission_photos (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id  UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  file_name      VARCHAR(255) NOT NULL,
  file_url       TEXT         NOT NULL,
  file_size      INTEGER      DEFAULT 0,
  uploaded_by    UUID         NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photos_submission ON submission_photos(submission_id);

-- ── 3. TAMBAH TIPE NOTIFIKASI BARU ────────────────────────────
-- Tambah nilai baru ke enum notif_type
ALTER TYPE notif_type ADD VALUE IF NOT EXISTS 'overdue_2days';
ALTER TYPE notif_type ADD VALUE IF NOT EXISTS 'deadline_approaching';
ALTER TYPE notif_type ADD VALUE IF NOT EXISTS 'vendor_selected';

-- ── 4. TABEL JADWAL NOTIFIKASI (untuk cron job) ────────────────
CREATE TABLE IF NOT EXISTS notification_schedule (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id   UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  type            VARCHAR(50) NOT NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  sent            BOOLEAN     NOT NULL DEFAULT FALSE,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(submission_id, type)
);

-- ── 5. TAMBAH KOLOM ITEMS UNTUK VENDOR 2 ──────────────────────
ALTER TABLE submission_items
  ADD COLUMN IF NOT EXISTS vendor_num SMALLINT DEFAULT 1; -- 1 = vendor 1, 2 = vendor 2

-- ── 6. INDEX TAMBAHAN ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_submissions_status_tanggal
  ON submissions(status, tanggal);
CREATE INDEX IF NOT EXISTS idx_submissions_batas_bayar
  ON submissions(batas_akhir_pembayaran, status);

SELECT 'Migration v2 berhasil! 🎉' AS status;
