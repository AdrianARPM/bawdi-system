// src/controllers/submissionController.js  — v2
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

// ── Helper: generate nomor pengajuan ─────────────────────────────
async function generateNomor(type, cabang) {
  const now = new Date();
  const mo  = String(now.getMonth() + 1).padStart(2, '0');
  const yr  = String(now.getFullYear()).slice(-2);
  const { count } = await supabase
    .from('submissions')
    .select('*', { count: 'exact', head: true })
    .ilike('nomor_pengajuan', `%-${type}/%${mo}${yr}`);
  const seq = String((count || 0) + 1).padStart(3, '0');
  const cab = cabang.replace(/\s+/g, '').toUpperCase().slice(0, 10);
  return `${seq}-${type}/BKD-${cab}/${mo}${yr}`;
}

// ── Helper: kirim notifikasi ke role tertentu ─────────────────────
async function notifyRole(role, submissionId, type, message) {
  const { data: users } = await supabase
    .from('users').select('id').eq('role', role).eq('is_active', true);
  if (!users?.length) return;
  await supabase.from('notifications').insert(
    users.map(u => ({ id: uuidv4(), user_id: u.id, submission_id: submissionId, type, message, is_read: false }))
  );
}

// ── Helper: kirim notifikasi ke user spesifik ─────────────────────
async function notifyUser(userId, submissionId, type, message) {
  await supabase.from('notifications').insert({
    id: uuidv4(), user_id: userId, submission_id: submissionId, type, message, is_read: false
  });
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
    if (req.user.role === 'Operasional') query = query.eq('pemohon_id', req.user.id);
    if (status) query = query.eq('status', status);
    if (type)   query = query.eq('type', type);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[submissions/list]', err);
    res.status(500).json({ error: 'Gagal mengambil data pengajuan' });
  }
}

// ── GET /api/submissions/stats ─────────────────────────────────────
async function stats(req, res) {
  try {
    let base = supabase.from('submissions').select('status, tanggal', { count: 'exact' });
    if (req.user.role === 'Operasional') base = base.eq('pemohon_id', req.user.id);
    const { data, error } = await base;
    if (error) throw error;
    const today        = new Date().toDateString();
    const twoDaysAgo   = new Date(Date.now() - 2 * 86400000).toISOString();
    const result = {
      total:                data.length,
      today:                data.filter(s => new Date(s.tanggal).toDateString() === today).length,
      menunggu_verifikasi:  data.filter(s => s.status === 'Menunggu Verifikasi').length,
      terverifikasi:        data.filter(s => s.status === 'Terverifikasi').length,
      disetujui:            data.filter(s => s.status === 'Disetujui').length,
      ditolak:              data.filter(s => s.status === 'Ditolak').length,
    };
    // Alert > 2 hari
    let alertQuery = supabase.from('submissions')
      .select('id, nomor_pengajuan, tanggal, status')
      .in('status', ['Menunggu Verifikasi', 'Terverifikasi'])
      .lt('tanggal', twoDaysAgo);
    if (req.user.role === 'Operasional') alertQuery = alertQuery.eq('pemohon_id', req.user.id);
    const { data: alerts } = await alertQuery;
    result.alerts = alerts || [];
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil statistik' });
  }
}

// ── GET /api/submissions/:id ───────────────────────────────────────
async function getOne(req, res) {
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select(`
        *,
        pemohon:users!submissions_pemohon_id_fkey(id, name, jabatan, cabang, nik),
        verifikator:users!submissions_verifikator_id_fkey(id, name, jabatan),
        approver:users!submissions_approver_id_fkey(id, name, jabatan),
        items:submission_items(*),
        messages(id, message, is_system, created_at, user:users(id, name, avatar_initials, role)),
        photos:submission_photos(id, file_name, file_url, file_size, created_at, uploaded_by)
      `)
      .eq('id', req.params.id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (req.user.role === 'Operasional' && data.pemohon_id !== req.user.id)
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
      type, kendaraan,
      vendor, npwp, vendor2, npwp2,
      jenis_pembelian, alasan, riwayat,
      batas_waktu_dana, batas_akhir_pembayaran,
      items  // [{ penjelasan, satuan, harga, vendor_num }]
    } = req.body;

    if (!type || !kendaraan || !vendor || !items?.length)
      return res.status(400).json({ error: 'Semua field wajib diisi' });

    // Hitung total per vendor
    const items1 = items.filter(i => i.vendor_num !== 2);
    const items2 = items.filter(i => i.vendor_num === 2);
    const total1 = items1.reduce((s, i) => s + (Number(i.harga) || 0), 0);
    const total2 = items2.reduce((s, i) => s + (Number(i.harga) || 0), 0);
    const total_harga = total1; // default total vendor 1

    const nomor        = await generateNomor(type, req.user.cabang);
    const submissionId = uuidv4();

    const { error: subErr } = await supabase.from('submissions').insert({
      id: submissionId,
      nomor_pengajuan: nomor,
      type, status: 'Menunggu Verifikasi',
      pemohon_id: req.user.id,
      cabang: req.user.cabang,
      kendaraan,
      vendor, npwp: npwp || '',
      vendor2: vendor2 || '', npwp2: npwp2 || '',
      vendor2_selected: !!(vendor2 && vendor2.trim()),
      jenis_pembelian, alasan, riwayat,
      batas_waktu_dana, batas_akhir_pembayaran,
      total_harga,
    });
    if (subErr) throw subErr;

    // Insert items
    const itemRows = items.map((i, idx) => ({
      id: uuidv4(),
      submission_id: submissionId,
      penjelasan: i.penjelasan,
      satuan: i.satuan,
      harga: Number(i.harga) || 0,
      total: Number(i.harga) || 0,
      vendor_num: i.vendor_num || 1,
      urutan: idx + 1,
    }));
    await supabase.from('submission_items').insert(itemRows);

    // Jadwalkan notifikasi 2 hari
    await scheduleOverdueNotif(submissionId, nomor, req.user.id);

    // Notifikasi ke Verifikator
    await notifyRole('Verifikator', submissionId, 'new_submission',
      `📋 Pengajuan baru ${nomor} dari ${req.user.name} menunggu verifikasi Anda.`);

    res.status(201).json({ message: 'Pengajuan berhasil dibuat', nomor_pengajuan: nomor, id: submissionId });
  } catch (err) {
    console.error('[submissions/create]', err);
    res.status(500).json({ error: 'Gagal membuat pengajuan: ' + err.message });
  }
}

// ── Helper: jadwalkan notifikasi overdue 2 hari ───────────────────
async function scheduleOverdueNotif(submissionId, nomor, pemohonId) {
  const scheduledAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('notification_schedule').upsert({
    id: uuidv4(),
    submission_id: submissionId,
    type: 'overdue_2days',
    scheduled_at: scheduledAt,
    sent: false,
  }, { onConflict: 'submission_id,type' });
}

// ── PUT /api/submissions/:id/select-vendor ─────────────────────────
// Approval memilih vendor mana yang disetujui
async function selectVendor(req, res) {
  try {
    const { vendor_pilihan, vendor_pilihan_alasan } = req.body;
    if (![1, 2].includes(Number(vendor_pilihan)))
      return res.status(400).json({ error: 'Pilihan vendor harus 1 atau 2' });

    const { data: sub } = await supabase.from('submissions')
      .select('status, nomor_pengajuan, pemohon_id, vendor, vendor2, items:submission_items(*)')
      .eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (!['Terverifikasi', 'Menunggu Verifikasi'].includes(sub.status))
      return res.status(400).json({ error: 'Pengajuan tidak dalam status yang bisa dipilih vendor' });

    // Hitung total vendor yang dipilih
    const selectedVendorNum = Number(vendor_pilihan);
    const selectedItems = sub.items.filter(i => i.vendor_num === selectedVendorNum);
    const newTotal = selectedItems.reduce((s, i) => s + (Number(i.total) || 0), 0);

    await supabase.from('submissions').update({
      vendor_pilihan: selectedVendorNum,
      vendor_pilihan_alasan: vendor_pilihan_alasan || '',
      total_harga: newTotal,
    }).eq('id', req.params.id);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.id, user_id: req.user.id,
      message: `🏆 ${req.user.name} memilih Vendor ${selectedVendorNum} (${selectedVendorNum === 1 ? sub.vendor : sub.vendor2}) sebagai pilihan terbaik. Alasan: ${vendor_pilihan_alasan || '-'}`,
      is_system: true,
    });

    await notifyUser(sub.pemohon_id, req.params.id, 'vendor_selected',
      `Vendor ${selectedVendorNum} dipilih untuk pengajuan ${sub.nomor_pengajuan}.`);

    res.json({ message: `Vendor ${vendor_pilihan} berhasil dipilih` });
  } catch (err) {
    console.error('[submissions/selectVendor]', err);
    res.status(500).json({ error: 'Gagal memilih vendor' });
  }
}

// ── PUT /api/submissions/:id/verify ───────────────────────────────
async function verify(req, res) {
  try {
    const { data: sub } = await supabase.from('submissions')
      .select('status, nomor_pengajuan, pemohon_id').eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (sub.status !== 'Menunggu Verifikasi')
      return res.status(400).json({ error: 'Status tidak memungkinkan verifikasi' });

    await supabase.from('submissions').update({
      status: 'Terverifikasi', verifikator_id: req.user.id,
      verifikasi_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.id, user_id: req.user.id,
      message: `✅ Diverifikasi oleh ${req.user.name} (${req.user.jabatan})`,
      is_system: true,
    });

    // Reset jadwal overdue — mulai hitung 2 hari lagi dari verifikasi
    await scheduleOverdueNotif(req.params.id, sub.nomor_pengajuan, sub.pemohon_id);

    await notifyRole('Approval', req.params.id, 'need_approval',
      `📋 Pengajuan ${sub.nomor_pengajuan} sudah terverifikasi, menunggu persetujuan Anda.`);
    await notifyUser(sub.pemohon_id, req.params.id, 'need_approval',
      `Pengajuan ${sub.nomor_pengajuan} Anda sudah diverifikasi, menunggu Approval.`);

    res.json({ message: 'Pengajuan berhasil diverifikasi' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memverifikasi pengajuan' });
  }
}

// ── PUT /api/submissions/:id/approve ──────────────────────────────
async function approve(req, res) {
  try {
    const { data: sub } = await supabase.from('submissions')
      .select('status, nomor_pengajuan, pemohon_id, batas_akhir_pembayaran')
      .eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (sub.status !== 'Terverifikasi')
      return res.status(400).json({ error: 'Pengajuan belum diverifikasi' });

    const now = new Date().toISOString();
    await supabase.from('submissions').update({
      status: 'Disetujui', approver_id: req.user.id, approval_at: now,
    }).eq('id', req.params.id);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.id, user_id: req.user.id,
      message: `✅ DISETUJUI oleh ${req.user.name} (${req.user.jabatan}). Silakan proses pembayaran.`,
      is_system: true,
    });

    await notifyUser(sub.pemohon_id, req.params.id, 'approved',
      `🎉 Pengajuan ${sub.nomor_pengajuan} Anda telah DISETUJUI. Segera proses pembayaran.`);

    // Jadwalkan notifikasi deadline pembayaran (H-2 sebelum batas)
    if (sub.batas_akhir_pembayaran) {
      const deadline   = new Date(sub.batas_akhir_pembayaran);
      const notifDate  = new Date(deadline.getTime() - 2 * 24 * 60 * 60 * 1000);
      if (notifDate > new Date()) {
        await supabase.from('notification_schedule').upsert({
          id: uuidv4(),
          submission_id: req.params.id,
          type: 'deadline_approaching',
          scheduled_at: notifDate.toISOString(),
          sent: false,
        }, { onConflict: 'submission_id,type' });
      }
    }

    // Hapus jadwal overdue karena sudah selesai
    await supabase.from('notification_schedule')
      .update({ sent: true, sent_at: now })
      .eq('submission_id', req.params.id)
      .eq('type', 'overdue_2days');

    res.json({ message: 'Pengajuan berhasil disetujui' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyetujui pengajuan' });
  }
}

// ── PUT /api/submissions/:id/reject ───────────────────────────────
async function reject(req, res) {
  try {
    const { alasan_tolak } = req.body;
    if (!alasan_tolak?.trim()) return res.status(400).json({ error: 'Alasan penolakan wajib diisi' });

    const { data: sub } = await supabase.from('submissions')
      .select('status, nomor_pengajuan, pemohon_id').eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    const now = new Date().toISOString();
    await supabase.from('submissions').update({
      status: 'Ditolak', approver_id: req.user.id,
      approval_at: now, alasan_tolak,
    }).eq('id', req.params.id);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.id, user_id: req.user.id,
      message: `❌ DITOLAK oleh ${req.user.name}: ${alasan_tolak}`,
      is_system: true,
    });

    await notifyUser(sub.pemohon_id, req.params.id, 'rejected',
      `❌ Pengajuan ${sub.nomor_pengajuan} ditolak. Alasan: ${alasan_tolak}`);

    // Hapus jadwal overdue
    await supabase.from('notification_schedule')
      .update({ sent: true, sent_at: now })
      .eq('submission_id', req.params.id)
      .eq('type', 'overdue_2days');

    res.json({ message: 'Pengajuan berhasil ditolak' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menolak pengajuan' });
  }
}

module.exports = { list, getOne, create, verify, approve, reject, stats, selectVendor };
