// src/controllers/submissionController.js  — v8 (dengan PAR flow)
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');
const { sendEmailToRole, sendEmailToUser, emailTemplates } = require('../utils/emailService');

// Helper: cek apakah user adalah Kepala Operasional
const isKepalaOp = (user) => user?.jabatan === 'Kepala Operasional';

// ── Helper notif ───────────────────────────────────────────────────
async function notifyRole(role, submissionId, type, message) {
  const { data: users } = await supabase
    .from('users').select('id').eq('role', role).eq('is_active', true);
  if (!users?.length) return;
  await supabase.from('notifications').insert(
    users.map(u => ({ id: uuidv4(), user_id: u.id, submission_id: submissionId, type, message, is_read: false }))
  );
}

async function notifyUser(userId, submissionId, type, message) {
  if (!userId) return;
  await supabase.from('notifications').insert({
    id: uuidv4(), user_id: userId, submission_id: submissionId, type, message, is_read: false
  });
}

// Notif khusus Kepala Operasional (cari berdasarkan jabatan)
async function notifyKepalaOp(submissionId, type, message) {
  const { data: users } = await supabase
    .from('users').select('id').eq('jabatan', 'Kepala Operasional').eq('is_active', true);
  if (!users?.length) return;
  await supabase.from('notifications').insert(
    users.map(u => ({ id: uuidv4(), user_id: u.id, submission_id: submissionId, type, message, is_read: false }))
  );
}

// Email ke Kepala Operasional
async function sendEmailToKepalaOp({ subject, message, nomor, submissionId, type }) {
  try {
    const { data: users } = await supabase
      .from('users').select('email, email_notif')
      .eq('jabatan', 'Kepala Operasional').eq('is_active', true).eq('email_notif', true);
    if (!users?.length) return;
    const { sendEmail } = require('../utils/emailService');
    await Promise.allSettled(
      users.filter(u => u.email).map(u =>
        sendEmail({ to: u.email, subject, message, nomor, submissionId, type })
      )
    );
  } catch (err) { console.error('[email/kepalaOp]', err.message); }
}

// ── GET /api/submissions/stats ─────────────────────────────────────
async function stats(req, res) {
  try {
    let base = supabase.from('submissions').select('status, tanggal', { count: 'exact' });
    if (req.user.role === 'Operasional' && !isKepalaOp(req.user)) base = base.eq('pemohon_id', req.user.id);
    const { data } = await base;
    const today = new Date().toDateString();
    const result = {
      total:               data.length,
      today:               data.filter(s => new Date(s.tanggal).toDateString() === today).length,
      menunggu_verifikasi: data.filter(s => s.status === 'Menunggu Verifikasi').length,
      terverifikasi:       data.filter(s => s.status === 'Terverifikasi').length,
      disetujui:           data.filter(s => s.status === 'Disetujui').length,
      ditolak:             data.filter(s => s.status === 'Ditolak').length,
    };
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    let alertQuery = supabase.from('submissions')
      .select('id, nomor_pengajuan, tanggal, status')
      .in('status', ['Menunggu Verifikasi', 'Terverifikasi'])
      .lt('tanggal', twoDaysAgo);
    if (req.user.role === 'Operasional' && !isKepalaOp(req.user)) alertQuery = alertQuery.eq('pemohon_id', req.user.id);
    const { data: alerts } = await alertQuery;
    result.alerts = alerts || [];
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil statistik' });
  }
}

// ── GET /api/submissions ──────────────────────────────────────────
async function list(req, res) {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let query = supabase
      .from('submissions')
      .select(`
        id, nomor_pengajuan, type, status, tanggal, kendaraan, vendor, vendor2,
        vendor_pilihan, jenis_pembelian, total_harga, batas_akhir_pembayaran,
        pemohon:users!submissions_pemohon_id_fkey(name, cabang),
        verifikator:users!submissions_verifikator_id_fkey(name),
        approver:users!submissions_approver_id_fkey(name)
      `, { count: 'exact' })
      .order('tanggal', { ascending: false })
      .range(offset, offset + Number(limit) - 1);
    // Operasional biasa lihat punyanya sendiri, Kepala Op lihat semua
    if (req.user.role === 'Operasional' && !isKepalaOp(req.user)) query = query.eq('pemohon_id', req.user.id);
    if (status) query = query.eq('status', status);
    if (type)   query = query.eq('type', type);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data pengajuan' });
  }
}

// ── GET /api/submissions/:id ───────────────────────────────────────
async function getOne(req, res) {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select(`
        *,
        pemohon:users!submissions_pemohon_id_fkey(id, name, jabatan, cabang, nik, email),
        verifikator:users!submissions_verifikator_id_fkey(id, name, jabatan),
        approver:users!submissions_approver_id_fkey(id, name, jabatan),
        items:submission_items(*),
        messages(id, message, is_system, created_at, user:users(id, name, avatar_initials, role)),
        photos:submission_photos(id, file_name, file_url, file_size, created_at, uploaded_by)
      `)
      .eq('id', req.params.id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    // Operasional biasa hanya boleh buka punyanya sendiri (Kepala Op boleh semua)
    if (req.user.role === 'Operasional' && !isKepalaOp(req.user) && data.pemohon_id !== req.user.id)
      return res.status(403).json({ error: 'Akses ditolak' });
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data pengajuan' });
  }
}

// ── POST /api/submissions ──────────────────────────────────────────
async function create(req, res) {
  try {
    const {
      nomor_pengajuan, nomor_urut, cabang_manual,
      type, kendaraan, vendor, npwp, rekening_tujuan,
      vendor2, npwp2, jenis_pembelian, alasan, riwayat,
      batas_waktu_dana, batas_akhir_pembayaran, items,km_pengajuan
    } = req.body;

    if (!nomor_pengajuan || !type || !kendaraan || !vendor || !items?.length)
      return res.status(400).json({ error: 'Semua field wajib diisi' });

    // Cek duplikat nomor dalam project/cabang yang sama
    if (nomor_urut && cabang_manual) {
      const { count } = await supabase
        .from('submissions')
        .select('*', { count: 'exact', head: true })
        .eq('nomor_urut', nomor_urut)
        .ilike('cabang_manual', cabang_manual.trim());
      if (count > 0) {
        return res.status(400).json({
          error: `Nomor urut ${nomor_urut} sudah digunakan di project/cabang ${cabang_manual}.`
        });
      }
    }

    const total1 = items.filter(i => i.vendor_num !== 2).reduce((s, i) => s + (Number(i.harga) || 0), 0);
    const submissionId = uuidv4();
    const now = new Date().toISOString();

    const { error: subErr } = await supabase.from('submissions').insert({
      id: submissionId,
      nomor_pengajuan, nomor_urut: nomor_urut || '', cabang_manual: cabang_manual || '',
      type, status: 'Menunggu Verifikasi',
      pemohon_id: req.user.id,
      cabang: req.user.cabang,
      kendaraan, vendor, npwp: npwp || '',
      rekening_tujuan: rekening_tujuan || '',
      vendor2: vendor2 || '', npwp2: npwp2 || '',
      vendor2_selected: !!(vendor2?.trim()),
      jenis_pembelian, alasan, riwayat,
      batas_waktu_dana, batas_akhir_pembayaran,
      total_harga: total1,
      tanggal: now,
    });
    if (subErr) throw subErr;

// Insert items (dengan km_pengajuan per-item + total qty × harga)
    await supabase.from('submission_items').insert(
      items.map((i, idx) => ({
        id: uuidv4(), submission_id: submissionId,
        penjelasan: i.penjelasan, satuan: i.satuan,
        harga: Number(i.harga) || 0,
        total: Number(i.total) || Number(i.harga) || 0,           // pakai i.total dari frontend (qty × harga)
        vendor_num: i.vendor_num || 1, urutan: idx + 1,
        km_pengajuan: i.km_pengajuan ? Number(i.km_pengajuan) : null,   // KM per item
      }))
    );

    await supabase.from('notification_schedule').upsert({
      id: uuidv4(), submission_id: submissionId,
      type: 'overdue_2days',
      scheduled_at: new Date(Date.now() + 2 * 86400000).toISOString(),
      sent: false,
    }, { onConflict: 'submission_id,type' });

    // ── Notifikasi & email — beda untuk PR vs PAR ────────────────
    if (type === 'PAR') {
      // PAR: notif langsung ke Kepala Operasional
      await notifyKepalaOp(submissionId, 'new_submission',
        `📋 Pengajuan PAR baru ${nomor_pengajuan} dari ${req.user.name} menunggu persetujuan Anda.`);
      const tmpl = emailTemplates.new_submission(nomor_pengajuan, req.user.name);
      sendEmailToKepalaOp({ ...tmpl, nomor: nomor_pengajuan, submissionId, type: 'new_submission' }).catch(() => {});
    } else {
      // PR: notif ke Verifikator
      await notifyRole('Verifikator', submissionId, 'new_submission',
        `📋 Pengajuan baru ${nomor_pengajuan} dari ${req.user.name} menunggu verifikasi Anda.`);
      const tmpl = emailTemplates.new_submission(nomor_pengajuan, req.user.name);
      sendEmailToRole('Verifikator', { ...tmpl, nomor: nomor_pengajuan, submissionId, type: 'new_submission' }).catch(() => {});
    }

    res.status(201).json({ message: 'Pengajuan berhasil dibuat', nomor_pengajuan, id: submissionId });
  } catch (err) {
    console.error('[submissions/create]', err);
    res.status(500).json({ error: 'Gagal membuat pengajuan: ' + err.message });
  }
}

// ── PUT /api/submissions/:id/select-vendor ─────────────────────────
async function selectVendor(req, res) {
  try {
    const { vendor_pilihan, vendor_pilihan_alasan } = req.body;
    if (![1, 2].includes(Number(vendor_pilihan)))
      return res.status(400).json({ error: 'Pilihan vendor harus 1 atau 2' });

    const { data: sub } = await supabase.from('submissions')
      .select('status, nomor_pengajuan, pemohon_id, vendor, vendor2, items:submission_items(*)')
      .eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    const vNum = Number(vendor_pilihan);
    const selectedItems = sub.items.filter(i => i.vendor_num === vNum);
    const newTotal = selectedItems.reduce((s, i) => s + (Number(i.total) || 0), 0);

    await supabase.from('submissions').update({
      vendor_pilihan: vNum,
      vendor_pilihan_alasan: vendor_pilihan_alasan || '',
      total_harga: newTotal,
    }).eq('id', req.params.id);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.id, user_id: req.user.id,
      message: `🏆 ${req.user.name} memilih Vendor ${vNum} (${vNum===1?sub.vendor:sub.vendor2}). Alasan: ${vendor_pilihan_alasan||'-'}`,
      is_system: true,
    });

    res.json({ message: `Vendor ${vendor_pilihan} berhasil dipilih` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memilih vendor' });
  }
}

// ── PUT /api/submissions/:id/verify ───────────────────────────────
// HANYA untuk PR (tipe PR), PAR tidak melewati langkah verifikasi
async function verify(req, res) {
  try {
    const { data: sub } = await supabase.from('submissions')
      .select('type, status, nomor_pengajuan, pemohon_id').eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    // PAR tidak boleh diverifikasi (langsung approve oleh Kepala Op)
    if (sub.type === 'PAR') {
      return res.status(400).json({ error: 'Pengajuan PAR langsung diproses oleh Kepala Operasional, tidak perlu verifikasi terpisah' });
    }

    // Cek role
    if (!['Verifikator', 'Admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Hanya Verifikator yang dapat memverifikasi pengajuan PR' });

    if (sub.status !== 'Menunggu Verifikasi')
      return res.status(400).json({ error: 'Status tidak memungkinkan verifikasi' });

    const now = new Date().toISOString();
    await supabase.from('submissions').update({
      status: 'Terverifikasi', verifikator_id: req.user.id, verifikasi_at: now,
    }).eq('id', req.params.id);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.id, user_id: req.user.id,
      message: `✅ Diverifikasi oleh ${req.user.name} (${req.user.jabatan})`, is_system: true,
    });

    await supabase.from('notification_schedule').upsert({
      id: uuidv4(), submission_id: req.params.id, type: 'overdue_2days',
      scheduled_at: new Date(Date.now() + 2 * 86400000).toISOString(), sent: false,
    }, { onConflict: 'submission_id,type' });

    await notifyRole('Approval', req.params.id, 'need_approval',
      `📋 Pengajuan ${sub.nomor_pengajuan} menunggu persetujuan Anda.`);
    await notifyUser(sub.pemohon_id, req.params.id, 'need_approval',
      `Pengajuan ${sub.nomor_pengajuan} sudah diverifikasi, menunggu Approval.`);

    const tmpl = emailTemplates.need_approval(sub.nomor_pengajuan);
    sendEmailToRole('Approval', { ...tmpl, nomor: sub.nomor_pengajuan, submissionId: req.params.id, type: 'need_approval' }).catch(() => {});
    sendEmailToUser(sub.pemohon_id, { ...emailTemplates.need_approval(sub.nomor_pengajuan), nomor: sub.nomor_pengajuan, submissionId: req.params.id }).catch(() => {});

    res.json({ message: 'Pengajuan berhasil diverifikasi' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memverifikasi pengajuan' });
  }
}

// ── PUT /api/submissions/:id/approve ──────────────────────────────
// PR: butuh status Terverifikasi, role Approval/Admin
// PAR: dari Menunggu Verifikasi langsung, butuh jabatan Kepala Operasional
async function approve(req, res) {
  try {
    const { data: sub } = await supabase.from('submissions')
      .select('type, status, nomor_pengajuan, pemohon_id, batas_akhir_pembayaran')
      .eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    const isPAR = sub.type === 'PAR';

    // ── Authorization check ─────────────────────────────────────
    if (isPAR) {
      if (!isKepalaOp(req.user) && req.user.role !== 'Admin')
        return res.status(403).json({ error: 'Hanya Kepala Operasional yang dapat menyetujui pengajuan PAR' });
    } else {
      if (!['Approval', 'Admin'].includes(req.user.role))
        return res.status(403).json({ error: 'Hanya Approval yang dapat menyetujui pengajuan PR' });
    }

    // ── Status check ────────────────────────────────────────────
    if (isPAR) {
      if (sub.status !== 'Menunggu Verifikasi')
        return res.status(400).json({ error: 'Pengajuan PAR sudah diproses sebelumnya' });
    } else {
      if (sub.status !== 'Terverifikasi')
        return res.status(400).json({ error: 'Pengajuan PR belum diverifikasi' });
    }

    const now = new Date().toISOString();
    const updateData = {
      status: 'Disetujui',
      approver_id: req.user.id,
      approval_at: now,
    };

    // PAR: set juga verifikator_id (Kepala Op = verifikator + approver)
    if (isPAR) {
      updateData.verifikator_id = req.user.id;
      updateData.verifikasi_at  = now;
    }

    await supabase.from('submissions').update(updateData).eq('id', req.params.id);

    const msgText = isPAR
      ? `✅ DISETUJUI oleh ${req.user.name} (Kepala Operasional). Silakan proses pembayaran.`
      : `✅ DISETUJUI oleh ${req.user.name}. Silakan proses pembayaran.`;
    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.id, user_id: req.user.id,
      message: msgText, is_system: true,
    });

    await notifyUser(sub.pemohon_id, req.params.id, 'approved',
      `🎉 Pengajuan ${sub.nomor_pengajuan} Anda telah DISETUJUI.`);

    // Untuk PAR — notif juga ke Admin/Approval (Administration) karena mereka yang akan handle nota & bayar
    if (isPAR) {
      await notifyRole('Approval', req.params.id, 'approved',
        `💰 PAR ${sub.nomor_pengajuan} telah disetujui Kepala Operasional. Silakan proses pembayaran.`);
    }

    const tmplApp = emailTemplates.approved(sub.nomor_pengajuan);
    sendEmailToUser(sub.pemohon_id, { ...tmplApp, nomor: sub.nomor_pengajuan, submissionId: req.params.id, type: 'approved' }).catch(() => {});
    if (isPAR) {
      sendEmailToRole('Approval', { ...tmplApp, nomor: sub.nomor_pengajuan, submissionId: req.params.id }).catch(() => {});
    }

    if (sub.batas_akhir_pembayaran) {
      const deadline  = new Date(sub.batas_akhir_pembayaran);
      const notifDate = new Date(deadline.getTime() - 2 * 86400000);
      if (notifDate > new Date()) {
        await supabase.from('notification_schedule').upsert({
          id: uuidv4(), submission_id: req.params.id, type: 'deadline_approaching',
          scheduled_at: notifDate.toISOString(), sent: false,
        }, { onConflict: 'submission_id,type' });
      }
    }

    await supabase.from('notification_schedule').update({ sent: true, sent_at: now })
      .eq('submission_id', req.params.id).eq('type', 'overdue_2days');

    res.json({ message: 'Pengajuan berhasil disetujui' });
  } catch (err) {
    console.error('[submissions/approve]', err);
    res.status(500).json({ error: 'Gagal menyetujui pengajuan' });
  }
}

// ── PUT /api/submissions/:id/reject ───────────────────────────────
async function reject(req, res) {
  try {
    const { alasan_tolak } = req.body;
    if (!alasan_tolak?.trim()) return res.status(400).json({ error: 'Alasan penolakan wajib diisi' });

    const { data: sub } = await supabase.from('submissions')
      .select('type, status, nomor_pengajuan, pemohon_id').eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    const isPAR = sub.type === 'PAR';

    // Authorization
    if (isPAR) {
      if (!isKepalaOp(req.user) && req.user.role !== 'Admin')
        return res.status(403).json({ error: 'Hanya Kepala Operasional yang dapat menolak pengajuan PAR' });
    } else {
      if (!['Approval', 'Verifikator', 'Admin'].includes(req.user.role))
        return res.status(403).json({ error: 'Anda tidak memiliki izin menolak pengajuan PR' });
    }

    const now = new Date().toISOString();
    await supabase.from('submissions').update({
      status: 'Ditolak', approver_id: req.user.id, approval_at: now, alasan_tolak,
    }).eq('id', req.params.id);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.id, user_id: req.user.id,
      message: `❌ DITOLAK oleh ${req.user.name}: ${alasan_tolak}`, is_system: true,
    });

    await notifyUser(sub.pemohon_id, req.params.id, 'rejected',
      `❌ Pengajuan ${sub.nomor_pengajuan} ditolak. Alasan: ${alasan_tolak}`);

    const tmplRej = emailTemplates.rejected(sub.nomor_pengajuan, alasan_tolak);
    sendEmailToUser(sub.pemohon_id, { ...tmplRej, nomor: sub.nomor_pengajuan, submissionId: req.params.id, type: 'rejected' }).catch(() => {});

    await supabase.from('notification_schedule').update({ sent: true, sent_at: now })
      .eq('submission_id', req.params.id).eq('type', 'overdue_2days');

    res.json({ message: 'Pengajuan berhasil ditolak' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menolak pengajuan' });
  }
}

module.exports = { list, getOne, create, verify, approve, reject, stats, selectVendor };
