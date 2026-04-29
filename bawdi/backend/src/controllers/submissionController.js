// src/controllers/submissionController.js
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

// ── Helper: generate nomor pengajuan ─────────────────────────────────────
async function generateNomor(type, cabang) {
  const now = new Date();
  const mo  = String(now.getMonth() + 1).padStart(2, '0');
  const yr  = String(now.getFullYear()).slice(-2);
  const key = `${type}/${mo}${yr}`;

  // Hitung berapa pengajuan bulan ini
  const { count } = await supabase
    .from('submissions')
    .select('*', { count: 'exact', head: true })
    .ilike('nomor_pengajuan', `%-${type}/%${mo}${yr}`);

  const seq = String((count || 0) + 1).padStart(3, '0');
  const cab = cabang.replace(/\s+/g, '').toUpperCase().slice(0, 10);
  return `${seq}-${type}/BKD-${cab}/${mo}${yr}`;
}

// ── Helper: kirim notifikasi ke role tertentu ─────────────────────────────
async function notifyRole(role, submissionId, type, message) {
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('role', role)
    .eq('is_active', true);

  if (!users?.length) return;

  const notifs = users.map(u => ({
    id: uuidv4(),
    user_id: u.id,
    submission_id: submissionId,
    type,
    message,
    is_read: false,
  }));

  await supabase.from('notifications').insert(notifs);
}

// ── GET /api/submissions ──────────────────────────────────────────────────
async function list(req, res) {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('submissions')
      .select(`
        id, nomor_pengajuan, type, status, tanggal, kendaraan, vendor,
        jenis_pembelian, total_harga, batas_akhir_pembayaran,
        pemohon:users!submissions_pemohon_id_fkey(name, cabang),
        verifikator:users!submissions_verifikator_id_fkey(name),
        approver:users!submissions_approver_id_fkey(name)
      `, { count: 'exact' })
      .order('tanggal', { ascending: false })
      .range(offset, offset + limit - 1);

    // Operasional hanya lihat pengajuannya sendiri
    if (req.user.role === 'Operasional') {
      query = query.eq('pemohon_id', req.user.id);
    }
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

// ── GET /api/submissions/:id ───────────────────────────────────────────────
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
        messages(id, message, created_at, user:users(id, name, avatar_initials, role))
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    // Operasional hanya bisa akses pengajuannya sendiri
    if (req.user.role === 'Operasional' && data.pemohon_id !== req.user.id) {
      return res.status(403).json({ error: 'Akses ditolak' });
    }

    res.json({ data });
  } catch (err) {
    console.error('[submissions/getOne]', err);
    res.status(500).json({ error: 'Gagal mengambil data pengajuan' });
  }
}

// ── POST /api/submissions ──────────────────────────────────────────────────
async function create(req, res) {
  try {
    const {
      type, kendaraan, vendor, jenis_pembelian, npwp,
      alasan, riwayat, batas_waktu_dana, batas_akhir_pembayaran, items
    } = req.body;

    // Validasi basic
    if (!type || !kendaraan || !vendor || !items?.length) {
      return res.status(400).json({ error: 'Semua field wajib diisi' });
    }

    const total_harga = items.reduce((s, i) => s + (Number(i.harga) || 0), 0);
    const nomor = await generateNomor(type, req.user.cabang);
    const submissionId = uuidv4();

    // Insert submission
    const { error: subErr } = await supabase.from('submissions').insert({
      id: submissionId,
      nomor_pengajuan: nomor,
      type,
      status: 'Menunggu Verifikasi',
      pemohon_id: req.user.id,
      cabang: req.user.cabang,
      kendaraan, vendor, jenis_pembelian, npwp,
      alasan, riwayat, batas_waktu_dana, batas_akhir_pembayaran,
      total_harga,
    });
    if (subErr) throw subErr;

    // Insert items
    const itemRows = items.map(i => ({
      id: uuidv4(),
      submission_id: submissionId,
      penjelasan: i.penjelasan,
      satuan: i.satuan,
      harga: Number(i.harga) || 0,
      total: Number(i.harga) || 0,
    }));
    await supabase.from('submission_items').insert(itemRows);

    // Notifikasi ke Verifikator
    await notifyRole(
      'Verifikator', submissionId, 'new_submission',
      `Pengajuan baru ${nomor} dari ${req.user.name} menunggu verifikasi Anda.`
    );

    res.status(201).json({ message: 'Pengajuan berhasil dibuat', nomor_pengajuan: nomor, id: submissionId });
  } catch (err) {
    console.error('[submissions/create]', err);
    res.status(500).json({ error: 'Gagal membuat pengajuan' });
  }
}

// ── PUT /api/submissions/:id/verify ───────────────────────────────────────
async function verify(req, res) {
  try {
    const { data: sub } = await supabase.from('submissions').select('status, nomor_pengajuan').eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (sub.status !== 'Menunggu Verifikasi') return res.status(400).json({ error: 'Status pengajuan tidak memungkinkan verifikasi' });

    await supabase.from('submissions').update({
      status: 'Terverifikasi',
      verifikator_id: req.user.id,
      verifikasi_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    // System message
    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.id, user_id: req.user.id,
      message: `✅ Pengajuan telah diverifikasi oleh ${req.user.name} (${req.user.jabatan})`,
      is_system: true,
    });

    // Notifikasi Approval
    await notifyRole('Approval', req.params.id, 'need_approval',
      `Pengajuan ${sub.nomor_pengajuan} sudah terverifikasi dan menunggu persetujuan Anda.`
    );

    res.json({ message: 'Pengajuan berhasil diverifikasi' });
  } catch (err) {
    console.error('[submissions/verify]', err);
    res.status(500).json({ error: 'Gagal memverifikasi pengajuan' });
  }
}

// ── PUT /api/submissions/:id/approve ──────────────────────────────────────
async function approve(req, res) {
  try {
    const { data: sub } = await supabase.from('submissions').select('status, nomor_pengajuan, pemohon_id').eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (sub.status !== 'Terverifikasi') return res.status(400).json({ error: 'Pengajuan belum diverifikasi' });

    await supabase.from('submissions').update({
      status: 'Disetujui',
      approver_id: req.user.id,
      approval_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.id, user_id: req.user.id,
      message: `✅ Pengajuan telah DISETUJUI oleh ${req.user.name} (${req.user.jabatan}). Silakan proses pembayaran.`,
      is_system: true,
    });

    // Notifikasi ke pemohon
    await supabase.from('notifications').insert({
      id: uuidv4(), user_id: sub.pemohon_id, submission_id: req.params.id,
      type: 'approved', message: `Pengajuan ${sub.nomor_pengajuan} Anda telah DISETUJUI oleh ${req.user.name}.`, is_read: false,
    });

    res.json({ message: 'Pengajuan berhasil disetujui' });
  } catch (err) {
    console.error('[submissions/approve]', err);
    res.status(500).json({ error: 'Gagal menyetujui pengajuan' });
  }
}

// ── PUT /api/submissions/:id/reject ───────────────────────────────────────
async function reject(req, res) {
  try {
    const { alasan_tolak } = req.body;
    if (!alasan_tolak?.trim()) return res.status(400).json({ error: 'Alasan penolakan wajib diisi' });

    const { data: sub } = await supabase.from('submissions')
      .select('status, nomor_pengajuan, pemohon_id')
      .eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (!['Terverifikasi', 'Menunggu Verifikasi'].includes(sub.status)) {
      return res.status(400).json({ error: 'Status pengajuan tidak memungkinkan penolakan' });
    }

    await supabase.from('submissions').update({
      status: 'Ditolak',
      approver_id: req.user.id,
      approval_at: new Date().toISOString(),
      alasan_tolak,
    }).eq('id', req.params.id);

    await supabase.from('messages').insert({
      id: uuidv4(), submission_id: req.params.id, user_id: req.user.id,
      message: `❌ Pengajuan DITOLAK oleh ${req.user.name}: ${alasan_tolak}`,
      is_system: true,
    });

    await supabase.from('notifications').insert({
      id: uuidv4(), user_id: sub.pemohon_id, submission_id: req.params.id,
      type: 'rejected', message: `Pengajuan ${sub.nomor_pengajuan} Anda DITOLAK. Alasan: ${alasan_tolak}`, is_read: false,
    });

    res.json({ message: 'Pengajuan berhasil ditolak' });
  } catch (err) {
    console.error('[submissions/reject]', err);
    res.status(500).json({ error: 'Gagal menolak pengajuan' });
  }
}

// ── GET /api/submissions/stats ─────────────────────────────────────────────
async function stats(req, res) {
  try {
    let base = supabase.from('submissions').select('status, tanggal', { count: 'exact' });
    if (req.user.role === 'Operasional') base = base.eq('pemohon_id', req.user.id);

    const { data, error } = await base;
    if (error) throw error;

    const today = new Date().toDateString();
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();

    const result = {
      total: data.length,
      today: data.filter(s => new Date(s.tanggal).toDateString() === today).length,
      menunggu_verifikasi: data.filter(s => s.status === 'Menunggu Verifikasi').length,
      terverifikasi: data.filter(s => s.status === 'Terverifikasi').length,
      disetujui: data.filter(s => s.status === 'Disetujui').length,
      ditolak: data.filter(s => s.status === 'Ditolak').length,
    };

    // Alert: pengajuan > 3 hari belum ditanggapi
    const { data: alerts } = await (req.user.role === 'Operasional'
      ? supabase.from('submissions').select('id, nomor_pengajuan, tanggal, status')
          .in('status', ['Menunggu Verifikasi', 'Terverifikasi'])
          .eq('pemohon_id', req.user.id)
          .lt('tanggal', threeDaysAgo)
      : supabase.from('submissions').select('id, nomor_pengajuan, tanggal, status')
          .in('status', ['Menunggu Verifikasi', 'Terverifikasi'])
          .lt('tanggal', threeDaysAgo));

    result.alerts = alerts || [];
    res.json(result);
  } catch (err) {
    console.error('[submissions/stats]', err);
    res.status(500).json({ error: 'Gagal mengambil statistik' });
  }
}

module.exports = { list, getOne, create, verify, approve, reject, stats };
