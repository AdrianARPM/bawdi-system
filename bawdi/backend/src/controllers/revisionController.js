// src/controllers/revisionController.js  — v16
// v16: uploadNota dibatasi (Approval/Admin atau Operasional PEMOHON pengajuan);
//      tambah deleteNota dgn aturan akses sama. recordPayment/closeSubmission
//      tetap Approval/Admin (lewat route authorize) — tidak diubah.
// v18: diskon per item ikut terbawa ke snapshot revisi; total = (qty×harga)−diskon
// v11: KM per item + kategori_biaya ikut terbawa ke snapshot revisi
//      (requestRevision menyalin, editRevision menyimpan). Perbaikan total
//      revisi: total = qty (satuan) × harga, konsisten dgn submission v9.
// Fix: query submission disederhanakan, tidak pakai join active_snap yang bermasalah
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

// Helper: cek apakah user adalah Kepala Operasional
const isKepalaOp = (user) => user?.jabatan === 'Kepala Operasional';

const BUCKET_NOTA = 'bawdi-nota';

async function notifyUser(userId, submissionId, type, message) {
  if (!userId) return;
  try {
    await supabase.from('notifications').insert({
      id: uuidv4(), user_id: userId, submission_id: submissionId,
      type, message, is_read: false,
    });
  } catch (e) { console.error('[notifyUser]', e.message); }
}

async function notifyRole(role, submissionId, type, message) {
  try {
    const { data: users } = await supabase.from('users').select('id').eq('role', role).eq('is_active', true);
    if (!users?.length) return;
    await supabase.from('notifications').insert(
      users.map(u => ({ id: uuidv4(), user_id: u.id, submission_id: submissionId, type, message, is_read: false }))
    );
  } catch (e) { console.error('[notifyRole]', e.message); }
}

// ── GET /api/revisions/:submissionId ─────────────────────────────
async function getRevisions(req, res) {
  try {
    const { data, error } = await supabase
      .from('revision_snapshots')
      .select(`
        *,
        items:revision_snapshot_items(*),
        diminta_oleh_user:users!revision_snapshots_diminta_oleh_fkey(name, jabatan, role),
        verifikator_user:users!revision_snapshots_verifikator_id_fkey(name, jabatan),
        approver_user:users!revision_snapshots_approver_id_fkey(name, jabatan)
      `)
      .eq('submission_id', req.params.submissionId)
      .order('revision_number', { ascending: true });

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('[revisions/get]', err);
    res.status(500).json({ error: 'Gagal mengambil data revisi' });
  }
}

// ── POST /api/revisions/:submissionId/request ─────────────────────
async function requestRevision(req, res) {
  try {
    const { alasan_revisi } = req.body;
    if (!alasan_revisi?.trim())
      return res.status(400).json({ error: 'Alasan revisi wajib diisi' });

    const submissionId = req.params.submissionId;

    // ── FIX: query sederhana tanpa join yang bermasalah ──────────
    const { data: sub, error: subErr } = await supabase
      .from('submissions')
      .select('id, type, nomor_pengajuan, status, pemohon_id, total_harga, alasan, riwayat, vendor, npwp, vendor2, npwp2, rekening_tujuan, revisi_diminta_oleh')
      .eq('id', submissionId)
      .single();

    if (subErr || !sub) {
      console.error('[requestRevision] submission not found:', subErr?.message);
      return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    }

    // ── Authorization khusus per tipe pengajuan ─────────────────
    // PAR: hanya Kepala Operasional + Admin yang bisa request revisi
    // PR:  Verifikator + Approval + Admin yang bisa request revisi
    const isPAR = sub.type === 'PAR';
    if (isPAR) {
      if (!isKepalaOp(req.user) && req.user.role !== 'Admin')
        return res.status(403).json({ error: 'Hanya Kepala Operasional yang dapat meminta revisi pengajuan PAR' });
    } else {
      if (!['Verifikator', 'Approval', 'Admin'].includes(req.user.role))
        return res.status(403).json({ error: 'Anda tidak memiliki izin meminta revisi pengajuan PR' });
    }

    // Ambil items terpisah
    const { data: subItems } = await supabase
      .from('submission_items')
      .select('*')
      .eq('submission_id', submissionId)
      .order('urutan');

    // Hitung revisi ke berapa
    const { count } = await supabase
      .from('revision_snapshots')
      .select('*', { count: 'exact', head: true })
      .eq('submission_id', submissionId);

    const revisionNumber = (count || 0) + 1;
    const now            = new Date().toISOString();
    const snapshotId     = uuidv4();

    // Cek apakah ada revisi sebelumnya yang disetujui → pakai datanya
    const { data: lastApproved } = await supabase
      .from('revision_snapshots')
      .select('*, items:revision_snapshot_items(*)')
      .eq('submission_id', submissionId)
      .eq('status', 'disetujui')
      .order('revision_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Tentukan sumber data snapshot baru
    const sourceData  = lastApproved || sub;
    const sourceItems = lastApproved?.items || subItems || [];

    // Buat snapshot revisi baru
    const { error: snapErr } = await supabase.from('revision_snapshots').insert({
      id:               snapshotId,
      submission_id:    submissionId,
      revision_number:  revisionNumber,
      alasan:           sourceData.alasan           || '',
      riwayat:          sourceData.riwayat          || '',
      vendor:           sourceData.vendor            || '',
      npwp:             sourceData.npwp              || '',
      vendor2:          sourceData.vendor2           || '',
      npwp2:            sourceData.npwp2             || '',
      rekening_tujuan:  sourceData.rekening_tujuan   || '',
      total_harga:      sourceData.total_harga       || 0,
      diminta_oleh:     req.user.id,
      alasan_revisi:    alasan_revisi.trim(),
      diminta_at:       now,
      status:           'draft',
    });

    if (snapErr) throw snapErr;

    // Salin items ke snapshot
    if (sourceItems.length > 0) {
      const calcRow = i => {
        const gross = (parseFloat(i.satuan) || 1) * (Number(i.harga) || 0);
        return Number(i.total) || Math.max(0, gross - (Number(i.diskon) || 0));
      };
      const itemRows = sourceItems.map((item, idx) => ({
        id:            uuidv4(),
        snapshot_id:   snapshotId,
        penjelasan:    item.penjelasan || '',
        satuan:        item.satuan     || '1 Kali',
        harga:         Number(item.harga) || 0,
        diskon:        Number(item.diskon) || 0,
        total:         calcRow(item),
        vendor_num:    item.vendor_num || 1,
        urutan:        idx + 1,
        km_pengajuan:  item.km_pengajuan != null ? Number(item.km_pengajuan) : null,
        kategori_biaya: item.kategori_biaya || 'Lainnya',
      }));
      await supabase.from('revision_snapshot_items').insert(itemRows);
    }

    // Update submission: status Perlu Revisi
    await supabase.from('submissions').update({
      status:              'Perlu Revisi',
      revisi_diminta_oleh: req.user.id,
      revisi_diminta_at:   now,
      revisi_catatan:      alasan_revisi.trim(),
      revisi_selesai_at:   null,
      revisi_count:        revisionNumber,
    }).eq('id', submissionId);

    // System message di chat
    await supabase.from('messages').insert({
      id:             uuidv4(),
      submission_id:  submissionId,
      user_id:        req.user.id,
      message:        `📝 Revisi ke-${revisionNumber} diminta oleh ${req.user.name}: "${alasan_revisi.trim()}"`,
      is_system:      true,
    });

    await notifyUser(
      sub.pemohon_id, submissionId, 'revision_request',
      `📝 Pengajuan ${sub.nomor_pengajuan} perlu direvisi ke-${revisionNumber}. Catatan: ${alasan_revisi}`
    );

    res.json({
      message:     `Permintaan revisi ke-${revisionNumber} berhasil dikirim`,
      snapshot_id: snapshotId,
    });
  } catch (err) {
    console.error('[revisions/request]', err);
    res.status(500).json({ error: 'Gagal membuat permintaan revisi: ' + err.message });
  }
}

// ── PUT /api/revisions/snapshot/:snapshotId — edit draft revisi ───
async function editRevision(req, res) {
  try {
    const { alasan, riwayat, vendor, npwp, vendor2, npwp2, rekening_tujuan, items } = req.body;

    const { data: snap, error: snapErr } = await supabase
      .from('revision_snapshots')
      .select('id, status, submission_id, revision_number')
      .eq('id', req.params.snapshotId)
      .single();

    if (snapErr || !snap) return res.status(404).json({ error: 'Snapshot revisi tidak ditemukan' });
    if (snap.status !== 'draft')
      return res.status(400).json({ error: 'Revisi ini sudah tidak bisa diedit (sudah dikirim)' });

    // Verifikasi pemohon
    if (req.user.role === 'Operasional') {
      const { data: sub } = await supabase
        .from('submissions').select('pemohon_id').eq('id', snap.submission_id).single();
      if (sub?.pemohon_id !== req.user.id)
        return res.status(403).json({ error: 'Hanya pemohon yang bisa mengedit revisi' });
    }

    if (!items?.length) return res.status(400).json({ error: 'Minimal 1 item wajib ada' });

    const calcRow = i => {
      const gross = (parseFloat(i.satuan) || 1) * (Number(i.harga) || 0);
      return Number(i.total) || Math.max(0, gross - (Number(i.diskon) || 0));
    };
    // total_harga revisi hanya menghitung item vendor 1 (konsisten dgn create)
    const total_harga = items.filter(i => (i.vendor_num || 1) !== 2).reduce((s, i) => s + calcRow(i), 0);

    await supabase.from('revision_snapshots').update({
      alasan: alasan || '', riwayat: riwayat || '',
      vendor: vendor || '', npwp: npwp || '',
      vendor2: vendor2 || '', npwp2: npwp2 || '',
      rekening_tujuan: rekening_tujuan || '',
      total_harga,
    }).eq('id', req.params.snapshotId);

    // Hapus items lama, insert baru
    await supabase.from('revision_snapshot_items').delete().eq('snapshot_id', req.params.snapshotId);
    await supabase.from('revision_snapshot_items').insert(
      items.map((item, idx) => ({
        id:            uuidv4(),
        snapshot_id:   req.params.snapshotId,
        penjelasan:    item.penjelasan || '',
        satuan:        item.satuan     || '1 Kali',
        harga:         Number(item.harga) || 0,
        diskon:        Number(item.diskon) || 0,
        total:         calcRow(item),
        vendor_num:    item.vendor_num || 1,
        urutan:        idx + 1,
        km_pengajuan:  item.km_pengajuan != null ? Number(item.km_pengajuan) : null,
        kategori_biaya: item.kategori_biaya || 'Lainnya',
      }))
    );

    res.json({ message: 'Revisi berhasil disimpan sebagai draft' });
  } catch (err) {
    console.error('[revisions/edit]', err);
    res.status(500).json({ error: 'Gagal menyimpan revisi: ' + err.message });
  }
}

// ── PUT /api/revisions/snapshot/:snapshotId/submit ────────────────
async function submitRevision(req, res) {
  try {
    const { data: snap, error: snapErr } = await supabase
      .from('revision_snapshots')
      .select('id, status, submission_id, revision_number, alasan, riwayat, vendor, npwp, vendor2, npwp2, rekening_tujuan, total_harga')
      .eq('id', req.params.snapshotId)
      .single();

    if (snapErr || !snap) return res.status(404).json({ error: 'Snapshot tidak ditemukan' });
    if (snap.status !== 'draft')
      return res.status(400).json({ error: 'Revisi ini sudah dikirim sebelumnya' });

    // Verifikasi pemohon
    if (req.user.role === 'Operasional') {
      const { data: sub } = await supabase
        .from('submissions').select('pemohon_id').eq('id', snap.submission_id).single();
      if (sub?.pemohon_id !== req.user.id)
        return res.status(403).json({ error: 'Hanya pemohon yang bisa mengirim revisi' });
    }

    const now = new Date().toISOString();

    await supabase.from('revision_snapshots')
      .update({ status: 'submitted' })
      .eq('id', req.params.snapshotId);

    // Update STATUS saja — data asli (alasan, riwayat, vendor, items)
    // TIDAK disinkronkan agar tab Pengajuan Asli tetap menampilkan data original
    await supabase.from('submissions').update({
      status:            'Menunggu Verifikasi',
      verifikator_id:    null,
      verifikasi_at:     null,
      approver_id:       null,
      approval_at:       null,
      revisi_selesai_at: now,
    }).eq('id', snap.submission_id);

    // Ambil data submission untuk notifikasi
    const { data: sub } = await supabase
      .from('submissions')
      .select('nomor_pengajuan, pemohon_id, revisi_diminta_oleh')
      .eq('id', snap.submission_id)
      .single();

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: snap.submission_id, user_id: req.user.id,
      message: `✅ Revisi ke-${snap.revision_number} selesai dikirim oleh ${req.user.name}. Menunggu verifikasi ulang.`,
      is_system: true,
    });

    await notifyRole('Verifikator', snap.submission_id, 'revision_done',
      `✅ Revisi ke-${snap.revision_number} pengajuan ${sub?.nomor_pengajuan} sudah selesai, silakan verifikasi ulang.`);

    if (sub?.revisi_diminta_oleh) {
      await notifyUser(sub.revisi_diminta_oleh, snap.submission_id, 'revision_done',
        `✅ Revisi ke-${snap.revision_number} sudah dikirim oleh pemohon.`);
    }

    res.json({ message: `Revisi ke-${snap.revision_number} berhasil dikirim` });
  } catch (err) {
    console.error('[revisions/submit]', err);
    res.status(500).json({ error: 'Gagal mengirim revisi: ' + err.message });
  }
}

// ── PUT /api/revisions/snapshot/:snapshotId/verify ────────────────
async function verifyRevision(req, res) {
  try {
    const { data: snap } = await supabase
      .from('revision_snapshots')
      .select('id, status, submission_id, revision_number')
      .eq('id', req.params.snapshotId).single();

    if (!snap) return res.status(404).json({ error: 'Snapshot tidak ditemukan' });
    if (snap.status !== 'submitted')
      return res.status(400).json({ error: 'Revisi belum dikirim oleh pemohon' });

    // Cek tipe submission
    const { data: subType } = await supabase
      .from('submissions').select('type').eq('id', snap.submission_id).single();
    const isPAR = subType?.type === 'PAR';

    // Authorization
    if (isPAR) {
      if (!isKepalaOp(req.user) && req.user.role !== 'Admin')
        return res.status(403).json({ error: 'Hanya Kepala Operasional yang dapat memverifikasi revisi PAR' });
    } else {
      if (!['Verifikator', 'Admin'].includes(req.user.role))
        return res.status(403).json({ error: 'Hanya Verifikator yang dapat memverifikasi revisi PR' });
    }

    const now = new Date().toISOString();
    await supabase.from('revision_snapshots').update({
      status: 'terverifikasi', verifikator_id: req.user.id, verifikasi_at: now,
    }).eq('id', req.params.snapshotId);

    await supabase.from('submissions').update({
      status: 'Terverifikasi', verifikator_id: req.user.id, verifikasi_at: now,
    }).eq('id', snap.submission_id);

    const { data: sub } = await supabase
      .from('submissions').select('nomor_pengajuan').eq('id', snap.submission_id).single();

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: snap.submission_id, user_id: req.user.id,
      message: `✅ Revisi ke-${snap.revision_number} diverifikasi oleh ${req.user.name}`,
      is_system: true,
    });

    // Notif ke approver yang sesuai
    if (isPAR) {
      const { data: kepalaOps } = await supabase
        .from('users').select('id').eq('jabatan', 'Kepala Operasional').eq('is_active', true);
      if (kepalaOps?.length) {
        await supabase.from('notifications').insert(kepalaOps.map(u => ({
          id: uuidv4(), user_id: u.id, submission_id: snap.submission_id,
          type: 'need_approval', message: `📋 Revisi ke-${snap.revision_number} PAR ${sub?.nomor_pengajuan} menunggu persetujuan.`,
          is_read: false,
        })));
      }
    } else {
      await notifyRole('Approval', snap.submission_id, 'need_approval',
        `📋 Revisi ke-${snap.revision_number} pengajuan ${sub?.nomor_pengajuan} menunggu persetujuan.`);
    }

    res.json({ message: 'Revisi berhasil diverifikasi' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal verifikasi revisi: ' + err.message });
  }
}

// ── PUT /api/revisions/snapshot/:snapshotId/approve ───────────────
async function approveRevision(req, res) {
  try {
    const { data: snap } = await supabase
      .from('revision_snapshots')
      .select('id, status, submission_id, revision_number, total_harga, items:revision_snapshot_items(*)')
      .eq('id', req.params.snapshotId).single();

    if (!snap) return res.status(404).json({ error: 'Snapshot tidak ditemukan' });
    if (snap.status !== 'terverifikasi')
      return res.status(400).json({ error: 'Revisi belum diverifikasi' });

    // Cek tipe submission
    const { data: subType } = await supabase
      .from('submissions').select('type').eq('id', snap.submission_id).single();
    const isPAR = subType?.type === 'PAR';

    // Authorization
    if (isPAR) {
      if (!isKepalaOp(req.user) && req.user.role !== 'Admin')
        return res.status(403).json({ error: 'Hanya Kepala Operasional yang dapat menyetujui revisi PAR' });
    } else {
      if (!['Approval', 'Admin'].includes(req.user.role))
        return res.status(403).json({ error: 'Hanya Approval yang dapat menyetujui revisi PR' });
    }

    const now = new Date().toISOString();

    await supabase.from('revision_snapshots').update({
      status: 'disetujui', approver_id: req.user.id, approval_at: now,
    }).eq('id', req.params.snapshotId);

    // Hanya update STATUS dan total_harga (untuk tracking pembayaran)
    // Data asli (submission_items, alasan, vendor, dll) TIDAK diubah
    // agar tab Pengajuan Asli selalu menampilkan data original pengajuan pertama
    await supabase.from('submissions').update({
      status:      'Disetujui',
      approver_id: req.user.id,
      approval_at: now,
      total_harga: snap.total_harga,  // update total untuk tracking pembayaran
    }).eq('id', snap.submission_id);

    const { data: sub } = await supabase
      .from('submissions').select('nomor_pengajuan, pemohon_id, batas_akhir_pembayaran').eq('id', snap.submission_id).single();

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: snap.submission_id, user_id: req.user.id,
      message: `✅ Revisi ke-${snap.revision_number} DISETUJUI oleh ${req.user.name}. Silakan proses pembayaran.`,
      is_system: true,
    });

    await notifyUser(sub?.pemohon_id, snap.submission_id, 'approved',
      `🎉 Revisi ke-${snap.revision_number} pengajuan ${sub?.nomor_pengajuan} telah DISETUJUI.`);

    // Jadwalkan notifikasi deadline
    if (sub?.batas_akhir_pembayaran) {
      const deadlineDate = new Date(sub.batas_akhir_pembayaran);
      const notifDate    = new Date(deadlineDate.getTime() - 2 * 86400000);
      if (notifDate > new Date()) {
        await supabase.from('notification_schedule').upsert({
          id: uuidv4(), submission_id: snap.submission_id,
          type: 'deadline_approaching', scheduled_at: notifDate.toISOString(), sent: false,
        }, { onConflict: 'submission_id,type' });
      }
    }

    res.json({ message: `Revisi ke-${snap.revision_number} berhasil disetujui` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyetujui revisi: ' + err.message });
  }
}

// ── PUT /api/revisions/snapshot/:snapshotId/reject ────────────────
async function rejectRevision(req, res) {
  try {
    const { alasan_tolak } = req.body;
    if (!alasan_tolak?.trim()) return res.status(400).json({ error: 'Alasan penolakan wajib diisi' });

    const { data: snap } = await supabase
      .from('revision_snapshots')
      .select('id, status, submission_id, revision_number')
      .eq('id', req.params.snapshotId).single();

    if (!snap) return res.status(404).json({ error: 'Snapshot tidak ditemukan' });

    // Cek tipe & authorization
    const { data: subType } = await supabase
      .from('submissions').select('type').eq('id', snap.submission_id).single();
    const isPAR = subType?.type === 'PAR';
    if (isPAR) {
      if (!isKepalaOp(req.user) && req.user.role !== 'Admin')
        return res.status(403).json({ error: 'Hanya Kepala Operasional yang dapat menolak revisi PAR' });
    } else {
      if (!['Approval', 'Verifikator', 'Admin'].includes(req.user.role))
        return res.status(403).json({ error: 'Anda tidak memiliki izin menolak revisi PR' });
    }

    const now = new Date().toISOString();
    await supabase.from('revision_snapshots').update({
      status: 'ditolak', approver_id: req.user.id, approval_at: now, alasan_tolak,
    }).eq('id', req.params.snapshotId);

    await supabase.from('submissions').update({
      status: 'Ditolak', approver_id: req.user.id, approval_at: now, alasan_tolak,
    }).eq('id', snap.submission_id);

    const { data: sub } = await supabase
      .from('submissions').select('nomor_pengajuan, pemohon_id').eq('id', snap.submission_id).single();

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: snap.submission_id, user_id: req.user.id,
      message: `❌ Revisi ke-${snap.revision_number} DITOLAK oleh ${req.user.name}: ${alasan_tolak}`,
      is_system: true,
    });

    await notifyUser(sub?.pemohon_id, snap.submission_id, 'rejected',
      `❌ Revisi ke-${snap.revision_number} ditolak. Alasan: ${alasan_tolak}`);

    res.json({ message: `Revisi ke-${snap.revision_number} berhasil ditolak` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menolak revisi: ' + err.message });
  }
}

// ── Nota, Bayar, Tutup, Draft (tidak berubah) ────────────────────
async function uploadNota(req, res) {
  try {
    const { data: sub } = await supabase.from('submissions')
      .select('status, nomor_pengajuan, pemohon_id').eq('id', req.params.submissionId).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (sub.status !== 'Disetujui') return res.status(400).json({ error: 'Nota hanya bisa diupload setelah Disetujui' });

    // Akses: Approval/Admin, atau Operasional yang merupakan PEMOHON pengajuan ini.
    const isOwnerOp = req.user.role === 'Operasional' && sub.pemohon_id === req.user.id;
    if (!['Approval', 'Admin'].includes(req.user.role) && !isOwnerOp)
      return res.status(403).json({ error: 'Hanya Approval atau pemohon pengajuan ini yang dapat mengunggah nota' });

    const { fileName, fileData, fileType, keterangan } = req.body;
    if (!fileName || !fileData || !fileType) return res.status(400).json({ error: 'fileName, fileData, fileType wajib' });

    const base64  = fileData.replace(/^data:[^;]+;base64,/, '');
    const buffer  = Buffer.from(base64, 'base64');
    if (buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'Maks 10MB' });

    const ext = fileName.split('.').pop();
    const storagePath = `${req.params.submissionId}/${uuidv4()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET_NOTA)
      .upload(storagePath, buffer, { contentType: fileType, upsert: false });
    if (upErr) throw upErr;

    const { data: urlData } = supabase.storage.from(BUCKET_NOTA).getPublicUrl(storagePath);
    const now = new Date().toISOString();

    const { data: nota } = await supabase.from('payment_notes').insert({
      id: uuidv4(), submission_id: req.params.submissionId, file_name: fileName,
      file_url: urlData.publicUrl, file_size: buffer.length,
      keterangan: keterangan || '', uploaded_by: req.user.id,
    }).select().single();

    await supabase.from('submissions').update({
      nota_url: urlData.publicUrl, nota_file_name: fileName,
      nota_uploaded_at: now, nota_uploaded_by: req.user.id,
    }).eq('id', req.params.submissionId);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.submissionId, user_id: req.user.id,
      message: `🧾 Nota "${fileName}" diupload oleh ${req.user.name}`, is_system: true,
    });

    res.status(201).json({ message: 'Nota berhasil diupload', nota });
  } catch (err) {
    res.status(500).json({ error: 'Gagal upload nota: ' + err.message });
  }
}

async function listNota(req, res) {
  try {
    const { data, error } = await supabase.from('payment_notes')
      .select('*').eq('submission_id', req.params.submissionId).order('created_at');
    if (error) throw error;
    res.json({ data });
  } catch { res.status(500).json({ error: 'Gagal mengambil nota' }); }
}

// DELETE /api/revisions/nota/:notaId
// Hapus / ganti nota. Akses: Approval/Admin atau Operasional pemohon pengajuan.
async function deleteNota(req, res) {
  try {
    const { data: nota } = await supabase.from('payment_notes')
      .select('id, submission_id, file_url, file_name').eq('id', req.params.notaId).single();
    if (!nota) return res.status(404).json({ error: 'Nota tidak ditemukan' });

    const { data: sub } = await supabase.from('submissions')
      .select('pemohon_id, nota_url').eq('id', nota.submission_id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    const isOwnerOp = req.user.role === 'Operasional' && sub.pemohon_id === req.user.id;
    if (!['Approval', 'Admin'].includes(req.user.role) && !isOwnerOp)
      return res.status(403).json({ error: 'Tidak berwenang menghapus nota ini' });

    // Hapus file dari storage (best-effort — record tetap dihapus walau file gagal)
    try {
      const path = nota.file_url.split(`${BUCKET_NOTA}/`)[1];
      if (path) await supabase.storage.from(BUCKET_NOTA).remove([path]);
    } catch (_) { /* abaikan */ }

    await supabase.from('payment_notes').delete().eq('id', nota.id);

    // Bila nota aktif di submission yang dihapus, alihkan ke nota terbaru yang tersisa
    if (sub.nota_url === nota.file_url) {
      const { data: rest } = await supabase.from('payment_notes')
        .select('file_url, file_name, created_at')
        .eq('submission_id', nota.submission_id)
        .order('created_at', { ascending: false }).limit(1);
      const latest = rest?.[0];
      await supabase.from('submissions').update({
        nota_url:       latest?.file_url  || '',
        nota_file_name: latest?.file_name || '',
      }).eq('id', nota.submission_id);
    }

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: nota.submission_id, user_id: req.user.id,
      message: `🗑️ Nota "${nota.file_name}" dihapus oleh ${req.user.name}`, is_system: true,
    });

    res.json({ message: 'Nota berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus nota: ' + err.message });
  }
}

async function recordPayment(req, res) {
  try {
    const { tanggal_bayar, jumlah_bayar, catatan_bayar } = req.body;
    if (!tanggal_bayar) return res.status(400).json({ error: 'Tanggal pembayaran wajib' });
    if (!jumlah_bayar || Number(jumlah_bayar) <= 0) return res.status(400).json({ error: 'Jumlah pembayaran wajib' });

    const { data: sub } = await supabase.from('submissions')
      .select('status, nomor_pengajuan, pemohon_id, nota_url').eq('id', req.params.submissionId).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (sub.status !== 'Disetujui') return res.status(400).json({ error: 'Pembayaran hanya bisa dicatat setelah Disetujui' });
    if (!sub.nota_url) return res.status(400).json({ error: 'Upload nota dulu sebelum mencatat pembayaran' });

    const fmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(jumlah_bayar));

    await supabase.from('submissions').update({
      tanggal_bayar, dibayar_oleh: req.user.id,
      jumlah_bayar: Number(jumlah_bayar), catatan_bayar: catatan_bayar || '',
    }).eq('id', req.params.submissionId);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.submissionId, user_id: req.user.id,
      message: `💰 Pembayaran ${fmt} dicatat oleh ${req.user.name} pada ${new Date(tanggal_bayar).toLocaleString('id-ID')}`,
      is_system: true,
    });

    await notifyUser(sub.pemohon_id, req.params.submissionId, 'payment_recorded',
      `💰 Pembayaran ${sub.nomor_pengajuan} sebesar ${fmt} telah dicatat.`);

    res.json({ message: 'Pembayaran berhasil dicatat' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mencatat pembayaran: ' + err.message });
  }
}

async function closeSubmission(req, res) {
  try {
    const { catatan_tutup } = req.body;
    const { data: sub } = await supabase.from('submissions')
      .select('status, nomor_pengajuan, pemohon_id, nota_url, tanggal_bayar, jumlah_bayar')
      .eq('id', req.params.submissionId).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (sub.status !== 'Disetujui') return res.status(400).json({ error: 'Status harus Disetujui sebelum ditutup' });

    const missing = [];
    if (!sub.nota_url)      missing.push('Nota pembayaran');
    if (!sub.tanggal_bayar) missing.push('Tanggal pembayaran');
    if (!sub.jumlah_bayar)  missing.push('Jumlah pembayaran');
    if (missing.length) return res.status(400).json({ error: `Lengkapi dulu: ${missing.join(', ')}` });

    const now = new Date().toISOString();
    await supabase.from('submissions').update({
      status: 'Selesai', ditutup_oleh: req.user.id, ditutup_at: now,
      catatan_tutup: catatan_tutup || '',
    }).eq('id', req.params.submissionId);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.submissionId, user_id: req.user.id,
      message: `🏁 Pengajuan DITUTUP dan disimpan ke Draft oleh ${req.user.name}. ${catatan_tutup || ''}`,
      is_system: true,
    });

    await notifyUser(sub.pemohon_id, req.params.submissionId, 'submission_closed',
      `🏁 Pengajuan ${sub.nomor_pengajuan} telah ditutup.`);

    res.json({ message: 'Pengajuan berhasil ditutup' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menutup pengajuan: ' + err.message });
  }
}

async function getDraft(req, res) {
  try {
    const { kendaraan, bulan, tahun, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let query = supabase.from('draft_submissions').select('*', { count: 'exact' })
      .order('ditutup_at', { ascending: false }).range(offset, offset + Number(limit) - 1);
    if (kendaraan) query = query.ilike('kendaraan', `%${kendaraan}%`);
    if (bulan)     query = query.eq('bulan', Number(bulan));
    if (tahun)     query = query.eq('tahun', Number(tahun));
    const { data, error, count } = await query;
    if (error) throw error;
    const { data: allDraft } = await supabase.from('draft_submissions').select('kendaraan, bulan, tahun, label_bulan');
    const kendaraanList = [...new Set((allDraft || []).map(d => d.kendaraan))].sort();
    const bulanList = [...new Map((allDraft || []).map(d => [
      `${d.bulan}-${d.tahun}`,
      { bulan: d.bulan, tahun: d.tahun, label: d.label_bulan?.trim() }
    ])).values()].sort((a, b) => (b.tahun * 12 + b.bulan) - (a.tahun * 12 + a.bulan));
    res.json({ data, total: count, kendaraanList, bulanList, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil draft: ' + err.message });
  }
}

module.exports = {
  getRevisions, requestRevision, editRevision, submitRevision,
  verifyRevision, approveRevision, rejectRevision,
  uploadNota, listNota, deleteNota, recordPayment, closeSubmission, getDraft,
};
