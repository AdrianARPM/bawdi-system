// src/controllers/revisionController.js
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

const BUCKET_NOTA = 'bawdi-nota';

async function notifyUser(userId, submissionId, type, message) {
  if (!userId) return;
  await supabase.from('notifications').insert({
    id: uuidv4(), user_id: userId, submission_id: submissionId,
    type, message, is_read: false
  });
}
async function notifyRole(role, submissionId, type, message) {
  const { data: users } = await supabase.from('users').select('id').eq('role', role).eq('is_active', true);
  if (!users?.length) return;
  await supabase.from('notifications').insert(
    users.map(u => ({ id: uuidv4(), user_id: u.id, submission_id: submissionId, type, message, is_read: false }))
  );
}

// ── GET /api/revisions/:submissionId ─────────────────────────────
async function getRevisions(req, res) {
  try {
    const { data, error } = await supabase
      .from('submission_revisions')
      .select(`
        *,
        diminta_oleh_user:users!submission_revisions_diminta_oleh_fkey(name, jabatan),
        diselesaikan_oleh_user:users!submission_revisions_diselesaikan_oleh_fkey(name, jabatan)
      `)
      .eq('submission_id', req.params.submissionId)
      .order('revisi_ke');
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil riwayat revisi' });
  }
}

// ── POST /api/revisions/:submissionId/request ─────────────────────
// Approval/Verifikator meminta revisi
async function requestRevision(req, res) {
  try {
    const { catatan } = req.body;
    if (!catatan?.trim()) return res.status(400).json({ error: 'Catatan revisi wajib diisi' });

    const { data: sub } = await supabase.from('submissions')
      .select('status, nomor_pengajuan, pemohon_id, total_harga, revisi_count')
      .eq('id', req.params.submissionId).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    const revisiKe = (sub.revisi_count || 0) + 1;
    const now = new Date().toISOString();

    // Insert riwayat revisi
    await supabase.from('submission_revisions').insert({
      id: uuidv4(),
      submission_id: req.params.submissionId,
      revisi_ke: revisiKe,
      diminta_oleh: req.user.id,
      catatan: catatan.trim(),
      diminta_at: now,
      total_sebelum: sub.total_harga || 0,
    });

    // Update status submission
    await supabase.from('submissions').update({
      status: 'Perlu Revisi',
      revisi_diminta_oleh: req.user.id,
      revisi_diminta_at: now,
      revisi_catatan: catatan.trim(),
      revisi_selesai_at: null,
      revisi_count: revisiKe,
    }).eq('id', req.params.submissionId);

    // System message di chat
    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.submissionId, user_id: req.user.id,
      message: `📝 Revisi ke-${revisiKe} diminta oleh ${req.user.name}: "${catatan.trim()}"`,
      is_system: true,
    });

    // Notifikasi ke pemohon
    await notifyUser(sub.pemohon_id, req.params.submissionId, 'revision_request',
      `📝 Pengajuan ${sub.nomor_pengajuan} perlu direvisi. Catatan: ${catatan}`);

    res.json({ message: `Permintaan revisi ke-${revisiKe} berhasil dikirim` });
  } catch (err) {
    console.error('[revisions/request]', err);
    res.status(500).json({ error: 'Gagal meminta revisi' });
  }
}

// ── PUT /api/revisions/:submissionId/submit ───────────────────────
// Pemohon mengirim hasil revisi
async function submitRevision(req, res) {
  try {
    const { perubahan, total_baru } = req.body;
    if (!perubahan?.trim()) return res.status(400).json({ error: 'Keterangan perubahan wajib diisi' });

    const { data: sub } = await supabase.from('submissions')
      .select('status, nomor_pengajuan, pemohon_id, total_harga, revisi_count, revisi_diminta_oleh')
      .eq('id', req.params.submissionId).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (sub.status !== 'Perlu Revisi') return res.status(400).json({ error: 'Pengajuan tidak dalam status Perlu Revisi' });

    // Pastikan hanya pemohon yang bisa submit revisi
    if (req.user.role === 'Operasional' && sub.pemohon_id !== req.user.id)
      return res.status(403).json({ error: 'Hanya pemohon yang bisa mengirim revisi' });

    const now     = new Date().toISOString();
    const totalBaru = total_baru ? Number(total_baru) : sub.total_harga;

    // Update riwayat revisi terakhir
    const { data: revisi } = await supabase
      .from('submission_revisions')
      .select('id')
      .eq('submission_id', req.params.submissionId)
      .eq('revisi_ke', sub.revisi_count)
      .single();

    if (revisi) {
      await supabase.from('submission_revisions').update({
        perubahan: perubahan.trim(),
        diselesaikan_oleh: req.user.id,
        selesai_at: now,
        total_sesudah: totalBaru,
      }).eq('id', revisi.id);
    }

    // Update submission kembali ke Menunggu Verifikasi
    await supabase.from('submissions').update({
      status: 'Menunggu Verifikasi',
      revisi_selesai_at: now,
      total_harga: totalBaru,
      // Reset approval flow agar diverifikasi ulang
      verifikator_id: null,
      verifikasi_at: null,
      approver_id: null,
      approval_at: null,
    }).eq('id', req.params.submissionId);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.submissionId, user_id: req.user.id,
      message: `✅ Revisi selesai oleh ${req.user.name}: "${perubahan.trim()}"${total_baru ? ` — Total diperbarui: Rp ${Number(total_baru).toLocaleString('id-ID')}` : ''}`,
      is_system: true,
    });

    // Notifikasi ke verifikator dan approver
    await notifyRole('Verifikator', req.params.submissionId, 'revision_done',
      `✅ Revisi pengajuan ${sub.nomor_pengajuan} sudah selesai, silakan verifikasi ulang.`);
    if (sub.revisi_diminta_oleh) {
      await notifyUser(sub.revisi_diminta_oleh, req.params.submissionId, 'revision_done',
        `✅ Revisi pengajuan ${sub.nomor_pengajuan} sudah diselesaikan oleh pemohon.`);
    }

    res.json({ message: 'Revisi berhasil dikirim, pengajuan kembali ke proses verifikasi' });
  } catch (err) {
    console.error('[revisions/submit]', err);
    res.status(500).json({ error: 'Gagal mengirim revisi' });
  }
}

// ── POST /api/revisions/:submissionId/nota ────────────────────────
// Upload nota pembayaran
async function uploadNota(req, res) {
  try {
    const { data: sub } = await supabase.from('submissions')
      .select('status, nomor_pengajuan').eq('id', req.params.submissionId).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (!['Disetujui'].includes(sub.status))
      return res.status(400).json({ error: 'Nota hanya bisa diupload pada pengajuan yang sudah Disetujui' });

    const { fileName, fileData, fileType, keterangan } = req.body;
    if (!fileName || !fileData || !fileType)
      return res.status(400).json({ error: 'fileName, fileData, fileType wajib diisi' });

    const allowedTypes = ['image/jpeg','image/png','image/webp','application/pdf'];
    if (!allowedTypes.includes(fileType))
      return res.status(400).json({ error: 'Format file tidak didukung. Gunakan JPG, PNG, atau PDF.' });

    const base64  = fileData.replace(/^data:[^;]+;base64,/, '');
    const buffer  = Buffer.from(base64, 'base64');

    if (buffer.length > 10 * 1024 * 1024)
      return res.status(400).json({ error: 'Ukuran file maksimal 10MB' });

    const ext = fileName.split('.').pop();
    const storagePath = `${req.params.submissionId}/${uuidv4()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET_NOTA)
      .upload(storagePath, buffer, { contentType: fileType, upsert: false });
    if (upErr) throw upErr;

    const { data: urlData } = supabase.storage.from(BUCKET_NOTA).getPublicUrl(storagePath);
    const now = new Date().toISOString();

    // Simpan ke tabel payment_notes
    const { data: nota } = await supabase.from('payment_notes').insert({
      id: uuidv4(),
      submission_id: req.params.submissionId,
      file_name: fileName,
      file_url: urlData.publicUrl,
      file_size: buffer.length,
      keterangan: keterangan || '',
      uploaded_by: req.user.id,
    }).select().single();

    // Update kolom shortcut di submissions
    await supabase.from('submissions').update({
      nota_url: urlData.publicUrl,
      nota_file_name: fileName,
      nota_uploaded_at: now,
      nota_uploaded_by: req.user.id,
    }).eq('id', req.params.submissionId);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.submissionId, user_id: req.user.id,
      message: `🧾 Nota pembayaran "${fileName}" berhasil diupload oleh ${req.user.name}`,
      is_system: true,
    });

    res.status(201).json({ message: 'Nota berhasil diupload', nota });
  } catch (err) {
    console.error('[revisions/uploadNota]', err);
    res.status(500).json({ error: 'Gagal upload nota: ' + err.message });
  }
}

// ── GET /api/revisions/:submissionId/nota ─────────────────────────
async function listNota(req, res) {
  try {
    const { data, error } = await supabase
      .from('payment_notes')
      .select('*, uploaded_by_user:users!payment_notes_uploaded_by_fkey(name)')
      .eq('submission_id', req.params.submissionId)
      .order('created_at');
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil nota' });
  }
}

// ── PUT /api/revisions/:submissionId/payment ──────────────────────
// Approval input tanggal & jam pembayaran
async function recordPayment(req, res) {
  try {
    const { tanggal_bayar, jumlah_bayar, catatan_bayar } = req.body;
    if (!tanggal_bayar) return res.status(400).json({ error: 'Tanggal pembayaran wajib diisi' });
    if (!jumlah_bayar || Number(jumlah_bayar) <= 0) return res.status(400).json({ error: 'Jumlah pembayaran wajib diisi' });

    const { data: sub } = await supabase.from('submissions')
      .select('status, nomor_pengajuan, pemohon_id, nota_url')
      .eq('id', req.params.submissionId).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (sub.status !== 'Disetujui') return res.status(400).json({ error: 'Pembayaran hanya bisa diinput pada pengajuan yang sudah Disetujui' });
    if (!sub.nota_url) return res.status(400).json({ error: 'Nota pembayaran harus diupload terlebih dahulu sebelum mencatat pembayaran' });

    const jumlah = Number(jumlah_bayar);
    const fmt = new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0 }).format(jumlah);

    await supabase.from('submissions').update({
      tanggal_bayar,
      dibayar_oleh: req.user.id,
      jumlah_bayar: jumlah,
      catatan_bayar: catatan_bayar || '',
    }).eq('id', req.params.submissionId);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.submissionId, user_id: req.user.id,
      message: `💰 Pembayaran ${fmt} dicatat oleh ${req.user.name} pada ${new Date(tanggal_bayar).toLocaleString('id-ID')}${catatan_bayar ? '. Catatan: ' + catatan_bayar : ''}`,
      is_system: true,
    });

    await notifyUser(sub.pemohon_id, req.params.submissionId, 'payment_recorded',
      `💰 Pembayaran pengajuan ${sub.nomor_pengajuan} sebesar ${fmt} telah dicatat.`);

    res.json({ message: 'Pembayaran berhasil dicatat' });
  } catch (err) {
    console.error('[revisions/recordPayment]', err);
    res.status(500).json({ error: 'Gagal mencatat pembayaran' });
  }
}

// ── PUT /api/revisions/:submissionId/close ────────────────────────
// Approval menutup pengajuan → status Selesai (masuk draft)
async function closeSubmission(req, res) {
  try {
    const { catatan_tutup } = req.body;

    const { data: sub } = await supabase.from('submissions')
      .select('status, nomor_pengajuan, pemohon_id, nota_url, tanggal_bayar, jumlah_bayar')
      .eq('id', req.params.submissionId).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (sub.status !== 'Disetujui') return res.status(400).json({ error: 'Pengajuan harus berstatus Disetujui sebelum ditutup' });

    // Validasi: nota dan pembayaran harus sudah ada
    const missing = [];
    if (!sub.nota_url)     missing.push('Nota pembayaran');
    if (!sub.tanggal_bayar) missing.push('Tanggal pembayaran');
    if (!sub.jumlah_bayar || sub.jumlah_bayar <= 0) missing.push('Jumlah pembayaran');
    if (missing.length > 0)
      return res.status(400).json({ error: `Data berikut harus diisi sebelum menutup pengajuan: ${missing.join(', ')}` });

    const now = new Date().toISOString();
    await supabase.from('submissions').update({
      status: 'Selesai',
      ditutup_oleh: req.user.id,
      ditutup_at: now,
      catatan_tutup: catatan_tutup || '',
    }).eq('id', req.params.submissionId);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.submissionId, user_id: req.user.id,
      message: `🏁 Pengajuan DITUTUP dan disimpan ke Draft oleh ${req.user.name} (${req.user.jabatan}). ${catatan_tutup ? 'Catatan: ' + catatan_tutup : ''}`,
      is_system: true,
    });

    await notifyUser(sub.pemohon_id, req.params.submissionId, 'submission_closed',
      `🏁 Pengajuan ${sub.nomor_pengajuan} telah ditutup dan disimpan ke arsip/draft.`);

    res.json({ message: 'Pengajuan berhasil ditutup dan disimpan ke draft' });
  } catch (err) {
    console.error('[revisions/close]', err);
    res.status(500).json({ error: 'Gagal menutup pengajuan' });
  }
}

// ── GET /api/revisions/draft ───────────────────────────────────────
// List semua pengajuan selesai (draft) dengan filter
async function getDraft(req, res) {
  try {
    const { kendaraan, bulan, tahun, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('draft_submissions')
      .select('*', { count: 'exact' })
      .order('ditutup_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (kendaraan) query = query.ilike('kendaraan', `%${kendaraan}%`);
    if (bulan)     query = query.eq('bulan', Number(bulan));
    if (tahun)     query = query.eq('tahun', Number(tahun));

    // Operasional hanya lihat miliknya
    // (view draft_submissions join pemohon, filter by pemohon_id tidak langsung tersedia)
    // Gunakan submission langsung
    const { data, error, count } = await query;
    if (error) throw error;

    // Ambil daftar plat unik dan bulan unik untuk filter
    const { data: allDraft } = await supabase
      .from('draft_submissions')
      .select('kendaraan, bulan, tahun, label_bulan');

    const kendaraanList = [...new Set((allDraft || []).map(d => d.kendaraan))].sort();
    const bulanList = [...new Map((allDraft || []).map(d => [
      `${d.bulan}-${d.tahun}`,
      { bulan: d.bulan, tahun: d.tahun, label: d.label_bulan?.trim() }
    ])).values()].sort((a,b) => (b.tahun*12+b.bulan) - (a.tahun*12+a.bulan));

    res.json({ data, total: count, kendaraanList, bulanList, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[revisions/draft]', err);
    res.status(500).json({ error: 'Gagal mengambil data draft' });
  }
}

module.exports = {
  getRevisions, requestRevision, submitRevision,
  uploadNota, listNota, recordPayment,
  closeSubmission, getDraft
};
