-- migration_v15_chat_reads.sql
-- Penanda "sudah dibaca" chat per-user per-pengajuan, untuk badge chat belum
-- dibaca di daftar pengajuan. Sumber badge kini LANGSUNG dari tabel messages
-- (bukan notifikasi), sehingga berlaku untuk semua chat (termasuk yang lama) &
-- bertahan walau notifikasi lonceng dibersihkan.
-- Jalankan di Supabase SQL Editor. Idempoten.

CREATE TABLE IF NOT EXISTS chat_reads (
  user_id       UUID NOT NULL,
  submission_id UUID NOT NULL,
  last_read_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, submission_id)
);

SELECT 'chat_reads siap 🎉' AS status;
