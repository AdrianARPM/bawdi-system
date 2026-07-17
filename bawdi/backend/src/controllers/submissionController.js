// src/controllers/submissionController.js  — v10 (PAR flow + Master Data)
// Fix v9 : total qty × harga, km_pengajuan tersimpan (submission & per-item)
// Fitur v10: kategori_biaya per item + auto-register plat ke master vehicles
// Fitur v18: diskon nominal per item — total = (qty × harga) − diskon
// Fitur v15: penanda is_umum (PR barang kantor/GA) — tanpa kendaraan/KM,
//            tidak auto-register ke master kendaraan
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');
const { sendEmailToRole, sendEmailToUser, emailTemplates } = require('../utils/emailService');
const { autoRegisterVehicle } = require('./vehicleController');
const { logAudit } = require('../utils/auditLogger');

// Helper: cek apakah user adalah Kepala Operasional
const isKepalaOp = (user) => user?.jabatan === 'Kepala Operasional';

// ── HRGA: verifikasi & approval khusus jenis pembelian Beban Dana Sosial ──
const DANA_SOSIAL = 'Beban Dana Sosial';
const isHRGA = (user) => user?.jabatan === 'HRGA';
const bolehHRGA = (user, jenis) => isHRGA(user) && jenis === DANA_SOSIAL;

// ── Helper notif ───────────────────────────────────────────────────
async function notifyRole(role, submissionId, type, message) {
  const { data: users } = await supabase
    .from('users').select('id').eq('role', role).eq('is_active', true);
  if (!users?.length) return;
  await supabase.from('notifications').insert(
    users.map(u => ({ id: uuidv4(), user_id: u.id, submission_id: submissionId, type, message, is_read: false }))
  );
  require('../utils/pushService').sendPushToRole(role, { body: message, submissionId }).catch(() => {});
}

async function notifyUser(userId, submissionId, type, message) {
  if (!userId) return;
  await supabase.from('notifications').insert({
    id: uuidv4(), user_id: userId, submission_id: submissionId, type, message, is_read: false
  });
  require('../utils/pushService').sendPushToUser(userId, { body: message, submissionId }).catch(() => {});
}

// Notif khusus Kepala Operasional (cari berdasarkan jabatan)
async function notifyKepalaOp(submissionId, type, message) {
  const { data: users } = await supabase
    .from('users').select('id').eq('jabatan', 'Kepala Operasional').eq('is_active', true);
  if (!users?.length) return;
  await supabase.from('notifications').insert(
    users.map(u => ({ id: uuidv4(), user_id: u.id, submission_id: submissionId, type, message, is_read: false }))
  );
  require('../utils/pushService').sendPushToJabatan('Kepala Operasional', { body: message, submissionId }).catch(() => {});
}

// Email ke Kepala Operasional
// Notif khusus HRGA (cari berdasarkan jabatan)
async function notifyHRGA(submissionId, type, message) {
  const { data: users } = await supabase
    .from('users').select('id').eq('jabatan', 'HRGA').eq('is_active', true);
  for (const u of (users || [])) await notifyUser(u.id, submissionId, type, message);
}

async function sendEmailToHRGA({ subject, message, nomor, submissionId, type }) {
  try {
    const { data: users } = await supabase.from('users').select('email')
      .eq('jabatan', 'HRGA').eq('is_active', true).eq('email_notif', true);
    const { sendEmail } = require('../utils/emailService');
    await Promise.all((users || []).filter(u => u.email).map(u =>
      sendEmail({ to: u.email, subject, message, nomor, submissionId, type })
    ));
  } catch (e) { console.error('[sendEmailToHRGA]', e.message); }
}

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
    let base = supabase.from('submissions').select('status, tanggal, jumlah_bayar, ditutup_at', { count: 'exact' });
    if (req.user.role === 'Operasional' && !isKepalaOp(req.user))
      base = isHRGA(req.user)
        ? base.or(`pemohon_id.eq.${req.user.id},jenis_pembelian.eq."${DANA_SOSIAL}"`)
        : base.eq('pemohon_id', req.user.id);
    const { data } = await base;
    const today = new Date().toDateString();
    const result = {
      total:               data.length,
      today:               data.filter(s => new Date(s.tanggal).toDateString() === today).length,
      menunggu_verifikasi: data.filter(s => s.status === 'Menunggu Verifikasi').length,
      terverifikasi:       data.filter(s => s.status === 'Terverifikasi').length,
      disetujui:           data.filter(s => s.status === 'Disetujui').length,
      ditolak:             data.filter(s => s.status === 'Ditolak').length,
      dibatalkan:          data.filter(s => s.status === 'Dibatalkan').length,
      belum_dibayar:       data.filter(s => s.status === 'Disetujui' && !(Number(s.jumlah_bayar) > 0)).length,
      sudah_dibayar_belum_tutup: data.filter(s => s.status === 'Disetujui' && Number(s.jumlah_bayar) > 0 && !s.ditutup_at).length,
    };
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    let alertQuery = supabase.from('submissions')
      .select('id, nomor_pengajuan, tanggal, status')
      .in('status', ['Menunggu Verifikasi', 'Terverifikasi'])
      .lt('tanggal', twoDaysAgo);
    if (req.user.role === 'Operasional' && !isKepalaOp(req.user))
      alertQuery = isHRGA(req.user)
        ? alertQuery.or(`pemohon_id.eq.${req.user.id},jenis_pembelian.eq."${DANA_SOSIAL}"`)
        : alertQuery.eq('pemohon_id', req.user.id);
    const { data: alerts } = await alertQuery;
    result.alerts = alerts || [];
    // Card Request Pembayaran (Admin/Verifikator/Approval): request yang belum dibayar
    if (['Admin', 'Verifikator', 'Approval'].includes(req.user.role)) {
      const { data: reqs } = await supabase.from('submissions')
        .select('id, nomor_pengajuan, bayar_diminta_at')
        .not('bayar_diminta_at', 'is', null)
        .is('tanggal_bayar', null)
        .eq('status', 'Disetujui')
        .order('bayar_diminta_at', { ascending: true })
        .limit(20);
      result.payment_requests = reqs || [];
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil statistik' });
  }
}

// ── GET /api/submissions ──────────────────────────────────────────
async function list(req, res) {
  try {
    const { status, type, q, belum_bayar, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let query = supabase
      .from('submissions')
      .select(`
        id, nomor_pengajuan, type, status, tanggal, kendaraan, vendor, vendor2,
        vendor_pilihan, jenis_pembelian, total_harga, batas_akhir_pembayaran, revisi_count,
        nota_url, approval_at,
        pemohon:users!submissions_pemohon_id_fkey(name, cabang),
        verifikator:users!submissions_verifikator_id_fkey(name),
        approver:users!submissions_approver_id_fkey(name)
      `, { count: 'exact' })
      .order('tanggal', { ascending: false })
      .range(offset, offset + Number(limit) - 1);
    // Operasional biasa lihat punyanya sendiri, Kepala Op lihat semua
    if (req.user.role === 'Operasional' && !isKepalaOp(req.user))
      query = isHRGA(req.user)
        ? query.or(`pemohon_id.eq.${req.user.id},jenis_pembelian.eq."${DANA_SOSIAL}"`)
        : query.eq('pemohon_id', req.user.id);
    if (status) query = query.eq('status', status);
    if (belum_bayar) query = query.eq('status', 'Disetujui').or('jumlah_bayar.is.null,jumlah_bayar.eq.0');
    if (type)   query = query.eq('type', type);
    // Pencarian server-side: nomor pengajuan + cabang (bersihkan karakter khusus PostgREST)
    if (q && q.trim()) {
      const term = q.replace(/[,()%*]/g, '').trim();
      if (term) query = query.or(`nomor_pengajuan.ilike.%${term}%,cabang.ilike.%${term}%`);
    }
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
    if (req.user.role === 'Operasional' && !isKepalaOp(req.user) && data.pemohon_id !== req.user.id && !bolehHRGA(req.user, data.jenis_pembelian))
      return res.status(403).json({ error: 'Akses ditolak' });

    // Info kunci Request Pembayaran utk pemohon: nota tertunggak > 3 hari sejak pelunasan
    if (req.user.id === data.pemohon_id) {
      const batas = new Date(Date.now() - 3 * 86400000).toISOString();
      const { data: tunggak } = await supabase.from('submissions')
        .select('id, nomor_pengajuan')
        .eq('pemohon_id', req.user.id)
        .neq('jenis_pembelian', 'Beban Izin Kendaraan')
        .not('bayar_diminta_at', 'is', null)
        .not('tanggal_bayar', 'is', null)
        .or('nota_url.is.null,nota_url.eq.')
        .lt('tanggal_bayar', batas)
        .neq('id', data.id)
        .limit(1);
      if (tunggak?.length) data.nota_tertunggak = { id: tunggak[0].id, nomor: tunggak[0].nomor_pengajuan };
    }

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
      vendor2, npwp2, jenis_pembelian, alasan, alasan_type, riwayat,
      batas_waktu_dana, batas_akhir_pembayaran, items, km_pengajuan,
      is_umum, ppn, pph23,
    } = req.body;

    // Pengajuan umum (barang kantor/GA) tidak punya kendaraan.
    if (!nomor_pengajuan || !type || !vendor || !items?.length)
      return res.status(400).json({ error: 'Semua field wajib diisi' });
    if (!is_umum && !kendaraan)
      return res.status(400).json({ error: 'Kendaraan wajib diisi' });

    // Cek duplikat nomor dalam project/cabang yang sama
    if (nomor_urut && cabang_manual) {
      const { count } = await supabase
        .from('submissions')
        .select('*', { count: 'exact', head: true })
        .eq('nomor_urut', nomor_urut)
        .ilike('cabang_manual', cabang_manual.trim())
      .neq('status', 'Dibatalkan');
      if (count > 0) {
        return res.status(400).json({
          error: `Nomor urut ${nomor_urut} sudah digunakan di project/cabang ${cabang_manual}.`
        });
      }
    }

    // Total baris = i.total dari frontend (sudah net diskon); fallback hitung sendiri:
    // (qty × harga) − diskon. Tidak pernah negatif.
    const calcRow = i => {
      const gross = (parseFloat(i.satuan) || 1) * (Number(i.harga) || 0);
      const net   = gross - (Number(i.diskon) || 0);
      return Number(i.total) || Math.max(0, net);
    };
    const total1 = items.filter(i => i.vendor_num !== 2).reduce((s, i) => s + calcRow(i), 0);
    const ppnVal = Number(ppn) || 0;
    const submissionId = uuidv4();
    const now = new Date().toISOString();

    const { error: subErr } = await supabase.from('submissions').insert({
      id: submissionId,
      nomor_pengajuan, nomor_urut: nomor_urut || '', cabang_manual: cabang_manual || '',
      type, status: 'Menunggu Verifikasi',
      pemohon_id: req.user.id,
      cabang: req.user.cabang,
      kendaraan: is_umum ? '' : kendaraan,
      is_umum: !!is_umum,
      vendor, npwp: npwp || '',
      rekening_tujuan: rekening_tujuan || '',
      vendor2: vendor2 || '', npwp2: npwp2 || '',
      vendor2_selected: !!(vendor2?.trim()),
      jenis_pembelian, alasan, alasan_type: alasan_type || '', riwayat,
      km_pengajuan: km_pengajuan != null ? Number(km_pengajuan) : null,
      batas_waktu_dana, batas_akhir_pembayaran,
      total_harga: total1 + ppnVal,
      ppn: ppnVal,
      pph23: pph23 || '',
      tanggal: now,
    });
    if (subErr) throw subErr;

    // Insert items — total qty × harga, KM per item, kategori biaya (v10)
    await supabase.from('submission_items').insert(
      items.map((i, idx) => ({
        id: uuidv4(), submission_id: submissionId,
        penjelasan: i.penjelasan, satuan: i.satuan,
        harga: Number(i.harga) || 0,
        diskon: Number(i.diskon) || 0,
        total: calcRow(i),
        vendor_num: i.vendor_num || 1, urutan: idx + 1,
        km_pengajuan: i.km_pengajuan != null ? Number(i.km_pengajuan) : null,
        km_manual:    i.km_manual != null ? Number(i.km_manual) : null,
        tgl_manual:   i.tgl_manual || null,
        kategori_biaya: i.kategori_biaya || 'Lainnya',
      }))
    );

    // v10: auto-register plat ke master kendaraan (non-blocking).
    // v15: pengajuan umum (barang kantor) tidak didaftarkan ke master.
    if (!is_umum) autoRegisterVehicle(kendaraan, req.user.cabang).catch(() => {});

    await supabase.from('notification_schedule').upsert({
      id: uuidv4(), submission_id: submissionId,
      type: 'overdue_2days',
      scheduled_at: new Date(Date.now() + 2 * 86400000).toISOString(),
      sent: false,
    }, { onConflict: 'submission_id,type' });

    // ── Notifikasi & email — beda untuk PR vs PAR ────────────────
    if (jenis_pembelian === DANA_SOSIAL) {
      // Dana Sosial: notif & email langsung ke HRGA (verifikasi & approval oleh HRGA)
      await notifyHRGA(submissionId, 'new_submission',
        `📋 Pengajuan Dana Sosial baru ${nomor_pengajuan} dari ${req.user.name} menunggu proses Anda.`);
      const tmplHrga = emailTemplates.new_submission(nomor_pengajuan, req.user.name);
      sendEmailToHRGA({ ...tmplHrga, nomor: nomor_pengajuan, submissionId, type: 'new_submission' }).catch(() => {});
    } else if (type === 'PAR') {
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
      .select('status, nomor_pengajuan, pemohon_id, vendor, vendor2, ppn, items:submission_items(*)')
      .eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    const vNum = Number(vendor_pilihan);
    const selectedItems = sub.items.filter(i => i.vendor_num === vNum);
    const newTotal = selectedItems.reduce((s, i) => s + (Number(i.total) || 0), 0);

    await supabase.from('submissions').update({
      vendor_pilihan: vNum,
      vendor_pilihan_alasan: vendor_pilihan_alasan || '',
      total_harga: newTotal + (Number(sub.ppn) || 0),
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
      .select('type, status, nomor_pengajuan, pemohon_id, jenis_pembelian').eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    // PAR tidak boleh diverifikasi (langsung approve oleh Kepala Op)
    if (sub.type === 'PAR') {
      return res.status(400).json({ error: 'Pengajuan PAR langsung diproses oleh Kepala Operasional, tidak perlu verifikasi terpisah' });
    }

    // Cek role
    if (!['Verifikator', 'Admin'].includes(req.user.role) && !bolehHRGA(req.user, sub.jenis_pembelian))
      return res.status(403).json({ error: 'Hanya Verifikator (atau HRGA untuk Beban Dana Sosial) yang dapat memverifikasi pengajuan PR' });

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

    logAudit(req, { action: 'verifikasi', target: sub.nomor_pengajuan, submissionId: req.params.id });
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
      .select('type, status, nomor_pengajuan, pemohon_id, batas_akhir_pembayaran, jenis_pembelian')
      .eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    const isPAR = sub.type === 'PAR';

    // ── Authorization check ─────────────────────────────────────
    if (isPAR) {
      if (!isKepalaOp(req.user) && req.user.role !== 'Admin' && !bolehHRGA(req.user, sub.jenis_pembelian))
        return res.status(403).json({ error: 'Hanya Kepala Operasional (atau HRGA untuk Beban Dana Sosial) yang dapat menyetujui pengajuan PAR' });
    } else {
      if (!['Approval', 'Admin'].includes(req.user.role) && !bolehHRGA(req.user, sub.jenis_pembelian))
        return res.status(403).json({ error: 'Hanya Approval (atau HRGA untuk Beban Dana Sosial) yang dapat menyetujui pengajuan PR' });
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

    logAudit(req, { action: 'setujui', target: sub.nomor_pengajuan, submissionId: req.params.id });
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
      .select('type, status, nomor_pengajuan, pemohon_id, jenis_pembelian').eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    const isPAR = sub.type === 'PAR';

    // Authorization
    if (isPAR) {
      if (!isKepalaOp(req.user) && req.user.role !== 'Admin' && !bolehHRGA(req.user, sub.jenis_pembelian))
        return res.status(403).json({ error: 'Hanya Kepala Operasional yang dapat menolak pengajuan PAR' });
    } else {
      if (!['Approval', 'Verifikator', 'Admin'].includes(req.user.role) && !bolehHRGA(req.user, sub.jenis_pembelian))
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

    logAudit(req, { action: 'tolak', target: sub.nomor_pengajuan, submissionId: req.params.id, detail: alasan_tolak });
    res.json({ message: 'Pengajuan berhasil ditolak' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menolak pengajuan' });
  }
}

// ── GET /api/submissions/overdue-action ───────────────────────────
// Pengajuan > 3 hari yang butuh tindakan dari user saat ini
async function overdueForAction(req, res) {
  try {
    const user = req.user;
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();

    let statuses = [];
    let typeFilter = null;

    if (user.role === 'Verifikator') {
      statuses = ['Menunggu Verifikasi'];
      typeFilter = 'PR';                        // Verifikator hanya tangani PR
    } else if (user.role === 'Approval') {
      statuses = ['Terverifikasi', 'Disetujui']; // approve PR + proses bayar PR/PAR
    } else if (isKepalaOp(user)) {
      statuses = ['Menunggu Verifikasi'];
      typeFilter = 'PAR';                        // Kepala Op tangani PAR
    } else if (user.role === 'Admin') {
      statuses = ['Menunggu Verifikasi', 'Terverifikasi', 'Disetujui'];
    } else {
      return res.json({ data: [] });             // Operasional biasa: tidak ada
    }

    let query = supabase
      .from('submissions')
      .select(`
        id, nomor_pengajuan, type, status, tanggal, kendaraan,
        total_harga, jumlah_bayar, jumlah_dp, nota_url, approval_at,
        pemohon:users!submissions_pemohon_id_fkey(name)
      `)
      .in('status', statuses)
      .lt('tanggal', threeDaysAgo)
      .order('tanggal', { ascending: true });

    if (typeFilter) query = query.eq('type', typeFilter);

    const { data, error } = await query;
    if (error) throw error;

    const result = (data || [])
      // Dibayar lunas tapi nota belum ada → yang ditunggu adalah PEMOHON (upload nota),
      // bukan tindakan Approval/Admin — jangan tampil di modal ini
      .filter(s => !(s.status === 'Disetujui' && Number(s.jumlah_bayar) > 0 && !s.nota_url))
      .map(s => {
        const paid = Number(s.jumlah_bayar) > 0;
        // Umur dihitung dari tahapnya: pengajuan Disetujui dihitung sejak disetujui,
        // bukan sejak dibuat — supaya yang baru di-approve tidak langsung dicap telat
        const baseDate = s.status === 'Disetujui' && s.approval_at ? s.approval_at : s.tanggal;
        return {
          ...s,
          days: Math.floor((Date.now() - new Date(baseDate).getTime()) / 86400000),
          action: s.status === 'Menunggu Verifikasi'
            ? (s.type === 'PAR' ? 'Perlu persetujuan Anda' : 'Perlu verifikasi')
            : s.status === 'Terverifikasi' ? 'Perlu persetujuan Anda'
            : paid ? 'Siap ditutup ke Arsip'
            : (Number(s.jumlah_dp) > 0 ? 'Perlu pelunasan' : 'Perlu proses pembayaran'),
        };
      })
      // Konsisten dengan judul modal: hanya yang benar-benar >3 hari di tahapnya
      .filter(s => s.days >= 3);

    res.json({ data: result });
  } catch (err) {
    console.error('[overdueForAction]', err);
    res.status(500).json({ error: 'Gagal mengambil pengajuan overdue' });
  }
}


// ── PUT /api/submissions/:id/cancel — Batalkan (soft delete, Admin) ──────────
// Dokumen tetap ada (status "Dibatalkan"), keluar dari semua antrean aktif.
async function cancelSubmission(req, res) {
  try {
    const { alasan } = req.body;
    if (!alasan?.trim()) return res.status(400).json({ error: 'Alasan pembatalan wajib diisi' });

    const { data: sub } = await supabase.from('submissions')
      .select('id, nomor_pengajuan, status, pemohon_id, jumlah_bayar, jumlah_dp')
      .eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    if (['Selesai', 'Dibatalkan'].includes(sub.status))
      return res.status(400).json({ error: `Pengajuan berstatus ${sub.status} tidak dapat dibatalkan` });
    if (Number(sub.jumlah_bayar) > 0 || Number(sub.jumlah_dp) > 0)
      return res.status(400).json({ error: 'Pengajuan yang sudah ada pembayaran/DP tidak dapat dibatalkan dari UI' });

    // Bebaskan nomor: beri sufiks -BATAL agar nomor asli bisa dipakai ulang
    const { count: nBatal } = await supabase.from('submissions')
      .select('*', { count: 'exact', head: true })
      .ilike('nomor_pengajuan', `${sub.nomor_pengajuan}-BATAL%`);
    const nomorBatal = `${sub.nomor_pengajuan}-BATAL${nBatal > 0 ? nBatal + 1 : ''}`;
    
    const { error } = await supabase.from('submissions').update({
      status:          'Dibatalkan',
      alasan_batal:    alasan.trim(),
      dibatalkan_at:   new Date().toISOString(),
      dibatalkan_oleh: req.user.id,
      nomor_pengajuan: nomorBatal,
    }).eq('id', sub.id);
    if (error) throw error;

    await notifyUser(sub.pemohon_id, sub.id, 'dibatalkan',
      `Pengajuan ${sub.nomor_pengajuan} dibatalkan oleh ${req.user.name}: ${alasan.trim()}`);
    logAudit(req, { action: 'batalkan', target: sub.nomor_pengajuan, submissionId: sub.id, detail: `${alasan.trim()} · nomor dibebaskan: ${sub.nomor_pengajuan} → ${nomorBatal}` });

    res.json({ message: `Pengajuan ${sub.nomor_pengajuan} dibatalkan` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membatalkan: ' + err.message });
  }
}

// ── DELETE /api/submissions/:id — Hapus permanen (Admin) ─────────────────────
// HANYA untuk pengajuan yang belum tersentuh proses (salah input / dobel).
// Wajib konfirmasi dengan mengetik ulang nomor pengajuan.
async function hardDeleteSubmission(req, res) {
  try {
    const { alasan, konfirmasi_nomor } = req.body;
    if (!alasan?.trim()) return res.status(400).json({ error: 'Alasan penghapusan wajib diisi' });

    const { data: sub } = await supabase.from('submissions')
      .select('id, nomor_pengajuan, status, jumlah_bayar, jumlah_dp, nota_url')
      .eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });

    if (sub.status !== 'Menunggu Verifikasi')
      return res.status(400).json({ error: 'Hanya pengajuan berstatus "Menunggu Verifikasi" (belum diproses) yang dapat dihapus permanen. Gunakan Batalkan untuk yang sudah berjalan.' });
    if (Number(sub.jumlah_bayar) > 0 || Number(sub.jumlah_dp) > 0 || sub.nota_url)
      return res.status(400).json({ error: 'Pengajuan dengan pembayaran/nota tidak dapat dihapus' });
    if (konfirmasi_nomor !== sub.nomor_pengajuan)
      return res.status(400).json({ error: 'Konfirmasi nomor pengajuan tidak cocok' });

    // Catat ke audit SEBELUM menghapus (log tidak ber-FK, tetap ada setelah delete)
    await logAudit(req, { action: 'hapus_permanen', target: sub.nomor_pengajuan, submissionId: sub.id, detail: alasan.trim() });

    // Urutan pembersihan turunan (FK melingkar: null-kan active_revision_id dulu)
    const sid = sub.id;
    await supabase.from('submissions').update({ active_revision_id: null }).eq('id', sid);
    const { data: snaps } = await supabase.from('revision_snapshots').select('id').eq('submission_id', sid);
    if (snaps?.length) {
      const snapIds = snaps.map(r => r.id);
      await supabase.from('revision_snapshot_items').delete().in('snapshot_id', snapIds);
      await supabase.from('revision_snapshots').delete().eq('submission_id', sid);
    }
    // Foto (tabel + file storage, best-effort)
    try {
      const { data: photos } = await supabase.from('submission_photos').select('id, url').eq('submission_id', sid);
      if (photos?.length) {
        await supabase.from('submission_photos').delete().eq('submission_id', sid);
      }
    } catch { /* abaikan */ }
    await supabase.from('messages').delete().eq('submission_id', sid);
    await supabase.from('notifications').delete().eq('submission_id', sid);
    await supabase.from('submission_items').delete().eq('submission_id', sid);
    const { error } = await supabase.from('submissions').delete().eq('id', sid);
    if (error) throw error;

    res.json({ message: `Pengajuan ${sub.nomor_pengajuan} dihapus permanen` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus: ' + err.message });
  }
}


// ── Deteksi Pengajuan Ganda ──────────────────────────────────────────────────
// Memperingatkan, TIDAK memblokir. Cocok bila: kendaraan sama (atau cabang+jenis
// utk pengajuan umum) + ada item yang mirip + status masih hidup + dalam 30 hari.
const STATUS_HIDUP = ['Menunggu Verifikasi', 'Terverifikasi', 'Disetujui'];

// Normalisasi teks item: huruf kecil, buang tanda baca & spasi ganda
function normTxt(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Mirip bila salah satu memuat yang lain, atau berbagi >= 2 kata bermakna (>3 huruf)
function itemMirip(a, b) {
  const na = normTxt(a), nb = normTxt(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = new Set(na.split(' ').filter(w => w.length > 3));
  const wb = nb.split(' ').filter(w => w.length > 3);
  return wb.filter(w => wa.has(w)).length >= 2;
}

// POST /api/submissions/check-duplicate
// body: { kendaraan, cabang, jenis_pembelian, is_umum, items: [{penjelasan}], exclude_id? }
async function checkDuplicate(req, res) {
  try {
    const { kendaraan, cabang, jenis_pembelian, is_umum, items = [], exclude_id } = req.body;
    const penjelasanList = items.map(i => i?.penjelasan).filter(Boolean);
    if (!penjelasanList.length) return res.json({ data: [] });

    const sejak = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('submissions')
      .select(`id, nomor_pengajuan, status, tanggal, kendaraan, cabang, total_harga,
               is_umum, jenis_pembelian,
               pemohon:users!submissions_pemohon_id_fkey(name),
               items:submission_items(penjelasan)`)
      .in('status', STATUS_HIDUP)
      .gte('tanggal', sejak)
      .order('tanggal', { ascending: false })
      .limit(50);

    if (is_umum) {
      if (!cabang?.trim()) return res.json({ data: [] });
      query = query.eq('is_umum', true).eq('cabang', cabang.trim());
      if (jenis_pembelian) query = query.eq('jenis_pembelian', jenis_pembelian);
    } else {
      if (!kendaraan?.trim()) return res.json({ data: [] });
      query = query.eq('kendaraan', kendaraan.trim());
    }
    if (exclude_id) query = query.neq('id', exclude_id);

    const { data, error } = await query;
    if (error) throw error;

    // Saring: hanya yang punya item mirip
    const hasil = [];
    for (const sub of data || []) {
      const cocok = [];
      for (const it of (sub.items || [])) {
        if (penjelasanList.some(p => itemMirip(p, it.penjelasan))) cocok.push(it.penjelasan);
      }
      if (cocok.length) {
        hasil.push({
          id: sub.id, nomor_pengajuan: sub.nomor_pengajuan, status: sub.status,
          tanggal: sub.tanggal, kendaraan: sub.kendaraan, cabang: sub.cabang,
          total_harga: sub.total_harga, pemohon: sub.pemohon?.name || null,
          item_mirip: [...new Set(cocok)].slice(0, 3),
        });
      }
    }

    res.json({ data: hasil.slice(0, 5) });
  } catch (err) {
    // Fitur bantu — jangan pernah menggagalkan alur pengajuan
    console.error('[check-duplicate]', err.message);
    res.json({ data: [] });
  }
}

// ── PUT /api/submissions/:id/request-payment ───────────────────────
// Pemohon meminta pembayaran: sekali saja (idempoten, anti double-click di server)
async function requestPayment(req, res) {
  try {
    const { data: sub } = await supabase.from('submissions')
      .select('id, status, pemohon_id, nomor_pengajuan, bayar_diminta_at, tanggal_bayar')
      .eq('id', req.params.id).single();
    if (!sub) return res.status(404).json({ error: 'Pengajuan tidak ditemukan' });
    if (req.user.id !== sub.pemohon_id)
      return res.status(403).json({ error: 'Hanya pemohon pengajuan ini yang dapat meminta pembayaran' });
    if (sub.status !== 'Disetujui')
      return res.status(400).json({ error: 'Request pembayaran hanya untuk pengajuan berstatus Disetujui' });
    if (sub.tanggal_bayar)
      return res.status(400).json({ error: 'Pengajuan ini sudah dibayarkan' });
    if (sub.bayar_diminta_at)
      return res.status(400).json({ error: 'Pembayaran sudah pernah direquest' });

    // Kunci: ada pengajuan lain milik pemohon (direquest & sudah dibayar) yang notanya menunggak > 3 hari
    const batas = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data: tunggak } = await supabase.from('submissions')
      .select('id, nomor_pengajuan')
      .eq('pemohon_id', req.user.id)
      .neq('jenis_pembelian', 'Beban Izin Kendaraan')
      .not('bayar_diminta_at', 'is', null)
      .not('tanggal_bayar', 'is', null)
      .or('nota_url.is.null,nota_url.eq.')
      .lt('tanggal_bayar', batas)
      .neq('id', sub.id)
      .limit(1);
    if (tunggak?.length)
      return res.status(403).json({ error: `Terkunci: unggah dulu nota pembayaran ${tunggak[0].nomor_pengajuan} yang menunggak lebih dari 3 hari` });

    // Idempoten: hanya set bila masih kosong (race-safe terhadap double click)
    const { data: updated } = await supabase.from('submissions')
      .update({ bayar_diminta_at: new Date().toISOString(), bayar_diminta_oleh: req.user.id })
      .eq('id', sub.id).is('bayar_diminta_at', null)
      .select('id');
    if (!updated?.length)
      return res.status(400).json({ error: 'Pembayaran sudah pernah direquest' });

    // Notifikasi in-app ke Approval (tanpa email, sesuai keputusan)
// Notifikasi in-app + push ke Approval & Verifikator (tanpa email)
    await notifyRole('Approval', sub.id, 'need_approval',
      `💳 ${req.user.name} meminta pembayaran ${sub.nomor_pengajuan}`);
    await notifyRole('Verifikator', sub.id, 'need_approval',
      `💳 ${req.user.name} meminta pembayaran ${sub.nomor_pengajuan}`);

    res.json({ message: 'Request pembayaran terkirim' });
  } catch (err) {
    console.error('[requestPayment]', err);
    res.status(500).json({ error: 'Gagal mengirim request pembayaran' });
  }
}

module.exports = { list, getOne, create, verify, approve, reject, stats, selectVendor, overdueForAction, cancelSubmission, hardDeleteSubmission, checkDuplicate, requestPayment };
