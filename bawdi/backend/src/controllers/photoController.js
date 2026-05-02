// src/controllers/photoController.js
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

const BUCKET = 'bawdi-photos';
const MAX_SIZE_MB = 10;

// ── POST /api/photos/:submissionId — upload foto ──────────────────
async function upload(req, res) {
  try {
    const { submissionId } = req.params;

    // Cek submission ada dan user punya akses
    const { data: sub } = await supabase.from('submissions')
      .select('id, pemohon_id, status, nomor_pengajuan').eq('id', submissionId).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (req.user.role === 'Operasional' && sub.pemohon_id !== req.user.id)
      return res.status(403).json({ error: 'Akses ditolak' });

    // Parse base64 dari body
    const { fileName, fileData, fileType } = req.body;
    if (!fileName || !fileData || !fileType)
      return res.status(400).json({ error: 'fileName, fileData, dan fileType wajib diisi' });

    // Validasi tipe file
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
    if (!allowedTypes.includes(fileType))
      return res.status(400).json({ error: 'Tipe file tidak didukung. Gunakan JPG, PNG, WEBP, atau PDF.' });

    // Decode base64
    const base64Data = fileData.replace(/^data:[^;]+;base64,/, '');
    const buffer     = Buffer.from(base64Data, 'base64');

    // Cek ukuran
    if (buffer.length > MAX_SIZE_MB * 1024 * 1024)
      return res.status(400).json({ error: `Ukuran file maksimal ${MAX_SIZE_MB}MB` });

    // Upload ke Supabase Storage
    const ext       = fileName.split('.').pop();
    const storagePath = `${submissionId}/${uuidv4()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: fileType,
        upsert: false,
      });
    if (uploadErr) throw uploadErr;

    // Ambil public URL
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const fileUrl = urlData.publicUrl;

    // Simpan record ke DB
    const { data: photo, error: dbErr } = await supabase.from('submission_photos').insert({
      id: uuidv4(),
      submission_id: submissionId,
      file_name: fileName,
      file_url: fileUrl,
      file_size: buffer.length,
      uploaded_by: req.user.id,
    }).select().single();
    if (dbErr) throw dbErr;

    res.status(201).json({ message: 'Foto berhasil diupload', photo });
  } catch (err) {
    console.error('[photos/upload]', err);
    res.status(500).json({ error: 'Gagal mengupload foto: ' + err.message });
  }
}

// ── GET /api/photos/:submissionId — list foto ──────────────────────
async function list(req, res) {
  try {
    const { data, error } = await supabase
      .from('submission_photos')
      .select('id, file_name, file_url, file_size, created_at, uploaded_by')
      .eq('submission_id', req.params.submissionId)
      .order('created_at');
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil foto' });
  }
}

// ── DELETE /api/photos/:photoId — hapus foto ──────────────────────
async function remove(req, res) {
  try {
    const { data: photo } = await supabase.from('submission_photos')
      .select('file_url, uploaded_by, submission_id').eq('id', req.params.photoId).single();
    if (!photo) return res.status(404).json({ error: 'Foto tidak ditemukan' });

    // Hanya uploader atau admin yang bisa hapus
    if (photo.uploaded_by !== req.user.id && req.user.role !== 'Admin')
      return res.status(403).json({ error: 'Tidak bisa menghapus foto milik orang lain' });

    // Hapus dari storage
    const path = photo.file_url.split(`${BUCKET}/`)[1];
    if (path) await supabase.storage.from(BUCKET).remove([path]);

    // Hapus dari DB
    await supabase.from('submission_photos').delete().eq('id', req.params.photoId);
    res.json({ message: 'Foto berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus foto' });
  }
}

module.exports = { upload, list, remove };
