// src/controllers/revisionController.js  — v6
// Sistem revisi baru: setiap revisi = snapshot penuh data pengajuan
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

const BUCKET_NOTA = 'bawdi-nota';

// ── Notif helpers ─────────────────────────────────────────────────
async function notifyUser(userId, submissionId, type, message) {
  if (!userId) return;
  await supabase.from('notifications').insert({ id: uuidv4(), user_id: userId, submission_id: submissionId, type, message, is_read: false });
}
async function notifyRole(role, submissionId, type, message) {
  const { data: users } = await supabase.from('users').select('id').eq('role', role).eq('is_active', true);
  if (!users?.length) return;
  await supabase.from('notifications').insert(users.map(u => ({ id: uuidv4(), user_id: u.id, submission_id: submissionId, type, message, is_read: false })));
}

// ── GET /api/revisions/:submissionId — ambil semua snapshot revisi ─
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
// Verifikator / Approval meminta revisi → buat snapshot draft baru
async function requestRevision(req, res) {
  try {
    const { alasan_revisi } = req.body;
    if (!alasan_revisi?.trim())
      return res.status(400).json({ error: 'Alasan revisi wajib diisi' });

    // Ambil data submission saat ini (atau revisi terakhir yang disetujui)
    const { data: sub } = await supabase
      .from('submissions')
      .select(`
        *, items:submission_items(*),
        active_snap:revision_snapshots(*)
      `)
      .eq('id', req.params.submissionId)
      .single();

    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    // Hitung revisi ke berapa
    const { count } = await supabase
      .from('revision_snapshots')
      .select('*', { count: 'exact', head: true })
      .eq('submission_id', req.params.submissionId);

    const revisionNumber = (count || 0) + 1;
    const now = new Date().toISOString();
    const snapshotId = uuidv4();

    // Tentukan data sumber: ambil dari revisi terakhir yang disetujui, atau dari asli
    let sourceData = sub;
    let sourceItems = sub.items || [];

    const { data: lastApproved } = await supabase
      .from('revision_snapshots')
      .select('*, items:revision_snapshot_items(*)')
      .eq('submission_id', req.params.submissionId)
      .eq('status', 'disetujui')
      .order('revision_number', { ascending: false })
      .limit(1)
      .single();

    if (lastApproved) {
      sourceData = { ...sub, ...lastApproved };
      sourceItems = lastApproved.items || [];
    }

    // Buat snapshot baru (copy dari data terakhir yang disetujui)
    await supabase.from('revision_snapshots').insert({
      id: snapshotId,
      submission_id: req.params.submissionId,
      revision_number: revisionNumber,
      alasan:          sourceData.alasan || '',
      riwayat:         sourceData.riwayat || '',
      vendor:          sourceData.vendor || '',
      npwp:            sourceData.npwp || '',
      vendor2:         sourceData.vendor2 || '',
      npwp2:           sourceData.npwp2 || '',
      rekening_tujuan: sourceData.rekening_tujuan || '',
      total_harga:     sourceData.total_harga || 0,
      diminta_oleh:    req.user.id,
      alasan_revisi:   alasan_revisi.trim(),
      diminta_at:      now,
      status:          'draft',
    });

    // Salin items ke snapshot
    if (sourceItems.length > 0) {
      await supabase.from('revision_snapshot_items').insert(
        sourceItems.map((item, idx) => ({
          id: uuidv4(),
          snapshot_id: snapshotId,
          penjelasan: item.penjelasan || '',
          satuan: item.satuan || '1 Kali',
          harga: Number(item.harga) || 0,
          total: Number(item.total || item.harga) || 0,
          vendor_num: item.vendor_num || 1,
          urutan: idx + 1,
        }))
      );
    }

    // Update submission: status Perlu Revisi, active_revision_id
    await supabase.from('submissions').update({
      status: 'Perlu Revisi',
      active_revision_id: snapshotId,
      revision_total: revisionNumber,
      revisi_diminta_oleh: req.user.id,
      revisi_diminta_at: now,
      revisi_catatan: alasan_revisi.trim(),
      revisi_selesai_at: null,
    }).eq('id', req.params.submissionId);

    // System message
    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.submissionId, user_id: req.user.id,
      message: `📝 Revisi ke-${revisionNumber} diminta oleh ${req.user.name}: "${alasan_revisi.trim()}"`,
      is_system: true,
    });

    await notifyUser(sub.pemohon_id, req.params.submissionId, 'revision_request',
      `📝 Pengajuan ${sub.nomor_pengajuan} perlu direvisi ke-${revisionNumber}. Catatan: ${alasan_revisi}`);

    res.json({ message: `Permintaan revisi ke-${revisionNumber} berhasil dibuat`, snapshot_id: snapshotId });
  } catch (err) {
    console.error('[revisions/request]', err);
    res.status(500).json({ error: 'Gagal membuat permintaan revisi: ' + err.message });
  }
}

// ── PUT /api/revisions/snapshot/:snapshotId — pemohon edit revisi ──
async function editRevision(req, res) {
  try {
    const { alasan, riwayat, vendor, npwp, vendor2, npwp2, rekening_tujuan, items } = req.body;

    const { data: snap } = await supabase
      .from('revision_snapshots')
      .select('*, submission:submissions(pemohon_id, nomor_pengajuan, status)')
      .eq('id', req.params.snapshotId)
      .single();

    if (!snap) return res.status(404).json({ error: 'Snapshot revisi tidak ditemukan' });
    if (snap.status !== 'draft')
      return res.status(400).json({ error: 'Revisi ini sudah tidak bisa diedit (sudah dikirim)' });

    // Hanya pemohon yang bisa edit
    if (req.user.role === 'Operasional' && snap.submission?.pemohon_id !== req.user.id)
      return res.status(403).json({ error: 'Hanya pemohon yang bisa mengedit revisi' });

    if (!items?.length) return res.status(400).json({ error: 'Minimal 1 item wajib ada' });

    const total_harga = items.reduce((s, i) => s + (Number(i.harga) || 0), 0);

    // Update snapshot
    await supabase.from('revision_snapshots').update({
      alasan:          alasan || '',
      riwayat:         riwayat || '',
      vendor:          vendor || '',
      npwp:            npwp || '',
      vendor2:         vendor2 || '',
      npwp2:           npwp2 || '',
      rekening_tujuan: rekening_tujuan || '',
      total_harga,
    }).eq('id', req.params.snapshotId);

    // Hapus items lama, insert yang baru
    await supabase.from('revision_snapshot_items').delete().eq('snapshot_id', req.params.snapshotId);
    await supabase.from('revision_snapshot_items').insert(
      items.map((item, idx) => ({
        id: uuidv4(),
        snapshot_id: req.params.snapshotId,
        penjelasan: item.penjelasan || '',
        satuan: item.satuan || '1 Kali',
        harga: Number(item.harga) || 0,
        total: Number(item.harga) || 0,
        vendor_num: item.vendor_num || 1,
        urutan: idx + 1,
      }))
    );

    res.json({ message: 'Revisi berhasil disimpan sebagai draft' });
  } catch (err) {
    console.error('[revisions/edit]', err);
    res.status(500).json({ error: 'Gagal menyimpan revisi: ' + err.message });
  }
}

// ── PUT /api/revisions/snapshot/:snapshotId/submit ────────────────
// Pemohon kirim hasil revisi → status kembali ke Menunggu Verifikasi
async function submitRevision(req, res) {
  try {
    const { data: snap } = await supabase
      .from('revision_snapshots')
      .select('*, submission:submissions(pemohon_id, nomor_pengajuan, revisi_diminta_oleh, items:submission_items(*))')
      .eq('id', req.params.snapshotId)
      .single();

    if (!snap) return res.status(404).json({ error: 'Snapshot tidak ditemukan' });
    if (snap.status !== 'draft')
      return res.status(400).json({ error: 'Revisi ini sudah dikirim sebelumnya' });
    if (req.user.role === 'Operasional' && snap.submission?.pemohon_id !== req.user.id)
      return res.status(403).json({ error: 'Hanya pemohon yang bisa mengirim revisi' });

    const now = new Date().toISOString();

    // Update status snapshot → submitted
    await supabase.from('revision_snapshots').update({ status: 'submitted' }).eq('id', req.params.snapshotId);

    // Update submission → kembali Menunggu Verifikasi, reset approval flow
    await supabase.from('submissions').update({
      status: 'Menunggu Verifikasi',
      verifikator_id: null,
      verifikasi_at: null,
      approver_id: null,
      approval_at: null,
      revisi_selesai_at: now,
      // Sinkronisasi data utama submission dari snapshot terbaru
      alasan:           snap.alasan,
      riwayat:          snap.riwayat,
      vendor:           snap.vendor,
      npwp:             snap.npwp,
      vendor2:          snap.vendor2,
      npwp2:            snap.npwp2,
      rekening_tujuan:  snap.rekening_tujuan,
      total_harga:      snap.total_harga,
    }).eq('id', snap.submission_id);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: snap.submission_id, user_id: req.user.id,
      message: `✅ Revisi ke-${snap.revision_number} selesai dikirim oleh ${req.user.name}. Menunggu verifikasi ulang.`,
      is_system: true,
    });

    await notifyRole('Verifikator', snap.submission_id, 'revision_done',
      `✅ Revisi ke-${snap.revision_number} pengajuan ${snap.submission?.nomor_pengajuan} sudah selesai, silakan verifikasi ulang.`);

    if (snap.submission?.revisi_diminta_oleh) {
      await notifyUser(snap.submission.revisi_diminta_oleh, snap.submission_id, 'revision_done',
        `✅ Revisi ke-${snap.revision_number} sudah dikirim oleh pemohon.`);
    }

    res.json({ message: `Revisi ke-${snap.revision_number} berhasil dikirim, menunggu verifikasi ulang` });
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
      .select('*, submission:submissions(nomor_pengajuan, pemohon_id)')
      .eq('id', req.params.snapshotId).single();

    if (!snap) return res.status(404).json({ error: 'Snapshot tidak ditemukan' });
    if (snap.status !== 'submitted')
      return res.status(400).json({ error: 'Revisi belum dikirim oleh pemohon' });

    const now = new Date().toISOString();
    await supabase.from('revision_snapshots').update({
      status: 'terverifikasi', verifikator_id: req.user.id, verifikasi_at: now,
    }).eq('id', req.params.snapshotId);

    await supabase.from('submissions').update({
      status: 'Terverifikasi', verifikator_id: req.user.id, verifikasi_at: now,
    }).eq('id', snap.submission_id);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: snap.submission_id, user_id: req.user.id,
      message: `✅ Revisi ke-${snap.revision_number} diverifikasi oleh ${req.user.name}`,
      is_system: true,
    });

    await notifyRole('Approval', snap.submission_id, 'need_approval',
      `📋 Revisi ke-${snap.revision_number} pengajuan ${snap.submission?.nomor_pengajuan} menunggu persetujuan Anda.`);

    res.json({ message: 'Revisi berhasil diverifikasi' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal verifikasi revisi' });
  }
}

// ── PUT /api/revisions/snapshot/:snapshotId/approve ───────────────
async function approveRevision(req, res) {
  try {
    const { data: snap } = await supabase
      .from('revision_snapshots')
      .select('*, items:revision_snapshot_items(*), submission:submissions(nomor_pengajuan, pemohon_id, batas_akhir_pembayaran)')
      .eq('id', req.params.snapshotId).single();

    if (!snap) return res.status(404).json({ error: 'Snapshot tidak ditemukan' });
    if (snap.status !== 'terverifikasi')
      return res.status(400).json({ error: 'Revisi belum diverifikasi' });

    const now = new Date().toISOString();

    await supabase.from('revision_snapshots').update({
      status: 'disetujui', approver_id: req.user.id, approval_at: now,
    }).eq('id', req.params.snapshotId);

    // Sync submission items dari snapshot yang disetujui
    await supabase.from('submission_items').delete().eq('submission_id', snap.submission_id);
    if (snap.items?.length) {
      await supabase.from('submission_items').insert(snap.items.map(item => ({
        id: uuidv4(),
        submission_id: snap.submission_id,
        penjelasan: item.penjelasan,
        satuan: item.satuan,
        harga: item.harga,
        total: item.total,
        vendor_num: item.vendor_num,
        urutan: item.urutan,
      })));
    }

    await supabase.from('submissions').update({
      status: 'Disetujui',
      approver_id: req.user.id,
      approval_at: now,
    }).eq('id', snap.submission_id);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: snap.submission_id, user_id: req.user.id,
      message: `✅ Revisi ke-${snap.revision_number} DISETUJUI oleh ${req.user.name}. Silakan proses pembayaran.`,
      is_system: true,
    });

    await notifyUser(snap.submission?.pemohon_id, snap.submission_id, 'approved',
      `🎉 Revisi ke-${snap.revision_number} pengajuan ${snap.submission?.nomor_pengajuan} telah DISETUJUI.`);

    // Jadwalkan notifikasi deadline
    if (snap.submission?.batas_akhir_pembayaran) {
      const deadlineDate = new Date(snap.submission.batas_akhir_pembayaran);
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
    res.status(500).json({ error: 'Gagal menyetujui revisi' });
  }
}

// ── PUT /api/revisions/snapshot/:snapshotId/reject ────────────────
async function rejectRevision(req, res) {
  try {
    const { alasan_tolak } = req.body;
    if (!alasan_tolak?.trim()) return res.status(400).json({ error: 'Alasan penolakan wajib diisi' });

    const { data: snap } = await supabase
      .from('revision_snapshots')
      .select('*, submission:submissions(nomor_pengajuan, pemohon_id)')
      .eq('id', req.params.snapshotId).single();

    if (!snap) return res.status(404).json({ error: 'Snapshot tidak ditemukan' });

    const now = new Date().toISOString();
    await supabase.from('revision_snapshots').update({
      status: 'ditolak', approver_id: req.user.id, approval_at: now, alasan_tolak,
    }).eq('id', req.params.snapshotId);

    await supabase.from('submissions').update({
      status: 'Ditolak', approver_id: req.user.id, approval_at: now, alasan_tolak,
    }).eq('id', snap.submission_id);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: snap.submission_id, user_id: req.user.id,
      message: `❌ Revisi ke-${snap.revision_number} DITOLAK oleh ${req.user.name}: ${alasan_tolak}`,
      is_system: true,
    });

    await notifyUser(snap.submission?.pemohon_id, snap.submission_id, 'rejected',
      `❌ Revisi ke-${snap.revision_number} ditolak. Alasan: ${alasan_tolak}`);

    res.json({ message: `Revisi ke-${snap.revision_number} berhasil ditolak` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menolak revisi' });
  }
}

// ── Upload nota, catat bayar, tutup (tidak berubah dari v5) ────────
async function uploadNota(req, res) {
  try {
    const { data: sub } = await supabase.from('submissions').select('status, nomor_pengajuan').eq('id', req.params.submissionId).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (sub.status !== 'Disetujui') return res.status(400).json({ error: 'Nota hanya bisa diupload setelah Disetujui' });

    const { fileName, fileData, fileType, keterangan } = req.body;
    if (!fileName || !fileData || !fileType) return res.status(400).json({ error: 'fileName, fileData, fileType wajib' });

    const base64  = fileData.replace(/^data:[^;]+;base64,/, '');
    const buffer  = Buffer.from(base64, 'base64');
    if (buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'Maks 10MB' });

    const ext = fileName.split('.').pop();
    const storagePath = `${req.params.submissionId}/${uuidv4()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET_NOTA).upload(storagePath, buffer, { contentType: fileType, upsert: false });
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
      .select('*, uploaded_by_user:users!payment_notes_uploaded_by_fkey(name)')
      .eq('submission_id', req.params.submissionId).order('created_at');
    if (error) throw error;
    res.json({ data });
  } catch { res.status(500).json({ error: 'Gagal mengambil nota' }); }
}

async function recordPayment(req, res) {
  try {
    const { tanggal_bayar, jumlah_bayar, catatan_bayar } = req.body;
    if (!tanggal_bayar) return res.status(400).json({ error: 'Tanggal pembayaran wajib' });
    if (!jumlah_bayar || Number(jumlah_bayar) <= 0) return res.status(400).json({ error: 'Jumlah pembayaran wajib' });

    const { data: sub } = await supabase.from('submissions').select('status, nomor_pengajuan, pemohon_id, nota_url').eq('id', req.params.submissionId).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (sub.status !== 'Disetujui') return res.status(400).json({ error: 'Pembayaran hanya bisa dicatat setelah Disetujui' });
    if (!sub.nota_url) return res.status(400).json({ error: 'Upload nota pembayaran dulu sebelum mencatat pembayaran' });

    const fmt = new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0 }).format(Number(jumlah_bayar));

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
    res.status(500).json({ error: 'Gagal mencatat pembayaran' });
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
    if (!sub.nota_url) missing.push('Nota pembayaran');
    if (!sub.tanggal_bayar) missing.push('Tanggal pembayaran');
    if (!sub.jumlah_bayar) missing.push('Jumlah pembayaran');
    if (missing.length) return res.status(400).json({ error: `Lengkapi dulu: ${missing.join(', ')}` });

    const now = new Date().toISOString();
    await supabase.from('submissions').update({
      status: 'Selesai', ditutup_oleh: req.user.id, ditutup_at: now, catatan_tutup: catatan_tutup || '',
    }).eq('id', req.params.submissionId);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.submissionId, user_id: req.user.id,
      message: `🏁 Pengajuan DITUTUP dan disimpan ke Draft oleh ${req.user.name}. ${catatan_tutup || ''}`,
      is_system: true,
    });

    await notifyUser(sub.pemohon_id, req.params.submissionId, 'submission_closed',
      `🏁 Pengajuan ${sub.nomor_pengajuan} telah ditutup dan disimpan ke arsip.`);

    res.json({ message: 'Pengajuan berhasil ditutup' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menutup pengajuan' });
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
    const kendaraanList = [...new Set((allDraft||[]).map(d => d.kendaraan))].sort();
    const bulanList = [...new Map((allDraft||[]).map(d => [`${d.bulan}-${d.tahun}`, { bulan: d.bulan, tahun: d.tahun, label: d.label_bulan?.trim() }])).values()].sort((a,b) => (b.tahun*12+b.bulan)-(a.tahun*12+a.bulan));
    res.json({ data, total: count, kendaraanList, bulanList, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil draft' });
  }
}

module.exports = {
  getRevisions, requestRevision, editRevision, submitRevision,
  verifyRevision, approveRevision, rejectRevision,
  uploadNota, listNota, recordPayment, closeSubmission, getDraft,
};
