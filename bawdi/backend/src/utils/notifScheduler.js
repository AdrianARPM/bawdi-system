// src/utils/notifScheduler.js  — v9 (digest nota juga ke pemohon per-orang)
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');
const { sendEmail, sendEmailToUser, sendEmailToRole, emailTemplates } = require('./emailService');
const { sendPushToUser, sendPushToRole, sendPushToJabatan } = require('./pushService');

async function notifyUser(userId, submissionId, type, message) {
  if (!userId) return;
  await supabase.from('notifications').insert({
    id: uuidv4(), user_id: userId, submission_id: submissionId, type, message, is_read: false
  });
  sendPushToUser(userId, { body: message, submissionId }).catch(() => {});
}

async function notifyRole(role, submissionId, type, message) {
  const { data: users } = await supabase.from('users').select('id').eq('role', role).eq('is_active', true);
  if (!users?.length) return;
  await supabase.from('notifications').insert(
    users.map(u => ({ id: uuidv4(), user_id: u.id, submission_id: submissionId, type, message, is_read: false }))
  );
  sendPushToRole(role, { body: message, submissionId }).catch(() => {});
}

// ── Cek overdue > 2 hari ─────────────────────────────────────────
async function checkOverdue() {
  try {
    const now = new Date().toISOString();
    const { data: schedules } = await supabase
      .from('notification_schedule')
      .select('id, submission_id, type')
      .eq('type', 'overdue_2days')
      .eq('sent', false)
      .lte('scheduled_at', now);

    if (!schedules?.length) return;

    for (const sched of schedules) {
      const { data: sub } = await supabase
        .from('submissions')
        .select('id, nomor_pengajuan, status, pemohon_id, tanggal')
        .eq('id', sched.submission_id)
        .single();

      if (!sub || !['Menunggu Verifikasi', 'Terverifikasi'].includes(sub.status)) {
        await supabase.from('notification_schedule').update({ sent: true, sent_at: now }).eq('id', sched.id);
        continue;
      }

      const daysSince = Math.floor((Date.now() - new Date(sub.tanggal)) / 86400000);
      const msg = `⚠️ Pengajuan ${sub.nomor_pengajuan} sudah ${daysSince} hari belum ada kejelasan! Segera ditindaklanjuti.`;

      // In-app notif
      await notifyUser(sub.pemohon_id, sub.id, 'overdue_2days', msg);
      await notifyRole('Verifikator', sub.id, 'overdue_2days', msg);
      await notifyRole('Approval', sub.id, 'overdue_2days', msg);

      // Email notif
      const tmpl = emailTemplates.overdue_2days(sub.nomor_pengajuan, daysSince);
      sendEmailToUser(sub.pemohon_id, { ...tmpl, nomor: sub.nomor_pengajuan, submissionId: sub.id, type: 'overdue_2days' }).catch(() => {});
      sendEmailToRole('Verifikator', { ...tmpl, nomor: sub.nomor_pengajuan, submissionId: sub.id }).catch(() => {});
      sendEmailToRole('Approval',    { ...tmpl, nomor: sub.nomor_pengajuan, submissionId: sub.id }).catch(() => {});

      await supabase.from('notification_schedule').update({ sent: true, sent_at: now }).eq('id', sched.id);
      console.log(`[scheduler] Overdue notif sent: ${sub.nomor_pengajuan}`);
    }
  } catch (err) { console.error('[scheduler/checkOverdue]', err.message); }
}

// ── Cek deadline pembayaran H-2 ───────────────────────────────────
async function checkDeadlines() {
  try {
    const now = new Date().toISOString();
    const { data: schedules } = await supabase
      .from('notification_schedule')
      .select('id, submission_id, type')
      .eq('type', 'deadline_approaching')
      .eq('sent', false)
      .lte('scheduled_at', now);

    if (!schedules?.length) return;

    for (const sched of schedules) {
      const { data: sub } = await supabase
        .from('submissions')
        .select('id, nomor_pengajuan, status, pemohon_id, total_harga, batas_akhir_pembayaran, approver_id')
        .eq('id', sched.submission_id)
        .single();

      if (!sub || sub.status !== 'Disetujui') {
        await supabase.from('notification_schedule').update({ sent: true, sent_at: now }).eq('id', sched.id);
        continue;
      }

      const deadline  = new Date(sub.batas_akhir_pembayaran);
      const daysLeft  = Math.ceil((deadline - Date.now()) / 86400000);
      const fmtTotal  = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(sub.total_harga);
      const fmtDate   = deadline.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

      const msg = `🔔 Batas akhir pembayaran ${sub.nomor_pengajuan} (${fmtTotal}) tinggal ${daysLeft} hari (${fmtDate}).`;

      if (sub.approver_id) await notifyUser(sub.approver_id, sub.id, 'deadline_approaching', msg);
      await notifyUser(sub.pemohon_id, sub.id, 'deadline_approaching', msg);
      await notifyRole('Admin', sub.id, 'deadline_approaching', msg);

      // Email
      const tmpl = emailTemplates.deadline_approaching(sub.nomor_pengajuan, fmtDate, fmtTotal);
      if (sub.approver_id) sendEmailToUser(sub.approver_id, { ...tmpl, nomor: sub.nomor_pengajuan, submissionId: sub.id }).catch(() => {});
      sendEmailToUser(sub.pemohon_id, { ...tmpl, nomor: sub.nomor_pengajuan, submissionId: sub.id }).catch(() => {});

      await supabase.from('notification_schedule').update({ sent: true, sent_at: now }).eq('id', sched.id);
      console.log(`[scheduler] Deadline notif sent: ${sub.nomor_pengajuan}`);
    }
  } catch (err) { console.error('[scheduler/checkDeadlines]', err.message); }
}

// ── Digest harian 07:00 WIB — ringkasan antrian per role ─────────
const DIGEST_HOUR_WIB = 7;

async function sendDailyDigest() {
  try {
    const hourWIB = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false,
    }).format(new Date()));
    if (hourWIB !== DIGEST_HOUR_WIB) return;

    // Anti-dobel: cek email_logs, sudah ada digest sejak 00:00 WIB hari ini?
    const todayWIB = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const startUTC = new Date(`${todayWIB}T00:00:00+07:00`).toISOString();
    const { count, error: logErr } = await supabase
      .from('email_logs').select('id', { count: 'exact', head: true })
      .eq('type', 'daily_digest').gte('created_at', startUTC);
    if (logErr) { console.error('[digest] cek log gagal, skip:', logErr.message); return; }
    if ((count || 0) > 0) return;

    const fmtRp = v => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v || 0);
    const line  = s => `• ${s.nomor_pengajuan} — ${fmtRp(s.total_harga)} (${new Date(s.tanggal).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short' })})`;

    const [verifQ, apprQ, parQ, notaQ] = await Promise.all([
      supabase.from('submissions').select('nomor_pengajuan,total_harga,tanggal').eq('type', 'PR').eq('status', 'Menunggu Verifikasi').order('tanggal'),
      supabase.from('submissions').select('nomor_pengajuan,total_harga,tanggal').eq('type', 'PR').eq('status', 'Terverifikasi').order('tanggal'),
      supabase.from('submissions').select('nomor_pengajuan,total_harga,tanggal').eq('type', 'PAR').in('status', ['Menunggu Verifikasi', 'Terverifikasi']).order('tanggal'),
      supabase.from('submissions').select('id,nomor_pengajuan,total_harga,tanggal,pemohon_id').eq('status', 'Disetujui').is('nota_url', null).order('tanggal'),
    ]).then(rs => rs.map(r => r.data || []));

    // Verifikator: antrian verifikasi PR
    if (verifQ.length) {
      const msg = `Ringkasan pagi BAWDI (${todayWIB}):\n\n${verifQ.length} pengajuan menunggu verifikasi Anda:\n${verifQ.map(line).join('\n')}\n\nBuka web BAWDI untuk memproses.`;
      sendEmailToRole('Verifikator', { subject: `📋 Digest Harian — ${verifQ.length} menunggu verifikasi`, message: msg, type: 'daily_digest' }).catch(() => {});
      sendPushToRole('Verifikator', { title: 'Digest Harian BAWDI', body: `${verifQ.length} pengajuan menunggu verifikasi Anda.` }).catch(() => {});
    }

    // Approval: antrian persetujuan PR + info nota belum ada
    if (apprQ.length || notaQ.length) {
      const parts = [];
      if (apprQ.length) parts.push(`${apprQ.length} pengajuan menunggu persetujuan Anda:\n${apprQ.map(line).join('\n')}`);
      if (notaQ.length) parts.push(`${notaQ.length} pengajuan disetujui tetapi belum ada nota.`);
      const msg = `Ringkasan pagi BAWDI (${todayWIB}):\n\n${parts.join('\n\n')}\n\nBuka web BAWDI untuk memproses.`;
      sendEmailToRole('Approval', { subject: `📋 Digest Harian — ${apprQ.length} menunggu persetujuan`, message: msg, type: 'daily_digest' }).catch(() => {});
      sendPushToRole('Approval', { title: 'Digest Harian BAWDI', body: `${apprQ.length} menunggu persetujuan, ${notaQ.length} belum ada nota.` }).catch(() => {});
    }

    // Kepala Operasional: antrian PAR
    if (parQ.length) {
      const msg = `Ringkasan pagi BAWDI (${todayWIB}):\n\n${parQ.length} pengajuan PAR menunggu keputusan Anda:\n${parQ.map(line).join('\n')}\n\nBuka web BAWDI untuk memproses.`;
      const { data: kops } = await supabase
        .from('users').select('email, email_notif')
        .eq('jabatan', 'Kepala Operasional').eq('is_active', true).eq('email_notif', true);
      await Promise.allSettled((kops || []).filter(u => u.email).map(u =>
        sendEmail({ to: u.email, subject: `📋 Digest Harian — ${parQ.length} PAR menunggu keputusan`, message: msg, type: 'daily_digest' })
      ));
      sendPushToJabatan('Kepala Operasional', { title: 'Digest Harian BAWDI', body: `${parQ.length} pengajuan PAR menunggu keputusan Anda.` }).catch(() => {});
    }

    // Pemohon: pengajuannya sendiri yang disetujui tapi BELUM ada nota (penekanan utama)
    if (notaQ.length) {
      const byPemohon = {};
      for (const s of notaQ) {
        if (!s.pemohon_id) continue;
        (byPemohon[s.pemohon_id] = byPemohon[s.pemohon_id] || []).push(s);
      }
      for (const [pid, rows] of Object.entries(byPemohon)) {
        const msg = `Ringkasan pagi BAWDI (${todayWIB}):\n\n${rows.length} pengajuan Anda sudah disetujui tetapi BELUM ada nota pembayaran:\n${rows.map(line).join('\n')}\n\nMohon segera upload nota di halaman pengajuan (tab Nota & Bayar).`;
        sendEmailToUser(pid, { subject: `📄 Digest Harian — ${rows.length} nota belum diupload`, message: msg, type: 'daily_digest' }).catch(() => {});
        sendPushToUser(pid, {
          title: 'Digest Harian BAWDI',
          body: `${rows.length} pengajuan Anda belum ada nota — mohon segera upload.`,
          submissionId: rows.length === 1 ? rows[0].id : null,
        }).catch(() => {});
      }
    }

    if (verifQ.length || apprQ.length || parQ.length || notaQ.length)
      console.log(`[scheduler] Daily digest terkirim (verif:${verifQ.length} appr:${apprQ.length} par:${parQ.length} nota:${notaQ.length})`);
  } catch (err) { console.error('[scheduler/dailyDigest]', err.message); }
}

// ── Cek Tunda: (a) >3 hari belum ditunda, (b) masa tunda habis → notif Admin + pemohon ──
async function checkTunda() {
  try {
    const nowMs = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: subs } = await supabase.from('submissions')
      .select('id, nomor_pengajuan, status, tanggal, pemohon_id, ditunda_sampai')
      .in('status', ['Menunggu Verifikasi', 'Terverifikasi']);
    if (!subs?.length) return;

    for (const sub of subs) {
      const lewat3Hari = nowMs - new Date(sub.tanggal).getTime() >= 3 * 86400000;

      // (b) masa tunda habis
      if (sub.ditunda_sampai && sub.ditunda_sampai < todayStr) {
        const type = 'tunda_habis';
        const { count } = await supabase.from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('submission_id', sub.id).eq('type', type);
        if (!count) {
          const msg = `⏰ Masa tunda ${sub.nomor_pengajuan} telah habis. Tinjau dan tanyakan ke pemohon sebelum membatalkan.`;
          await notifyRole('Admin', sub.id, type, msg);
        }
        continue; // sudah ditangani cabang (b), jangan ikut (a)
      }

      // (a) >3 hari & belum pernah ditunda
      if (lewat3Hari && !sub.ditunda_sampai) {
        const type = 'overdue_admin';
        const { count } = await supabase.from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('submission_id', sub.id).eq('type', type);
        if (!count) {
          const hari = Math.floor((nowMs - new Date(sub.tanggal).getTime()) / 86400000);
          const msg = `⚠️ ${sub.nomor_pengajuan} sudah ${hari} hari belum ditindaklanjuti dan belum ditunda. Perlu perhatian Admin.`;
          await notifyRole('Admin', sub.id, type, msg);
        }
      }
    }
  } catch (e) { console.error('[checkTunda]', e.message); }
}

let lastRunAt = null; // heartbeat untuk panel Status Sistem
async function runAll() {
  await checkOverdue(); await checkDeadlines(); await checkTunda(); await sendDailyDigest();
  lastRunAt = new Date().toISOString();
}
function getLastRunAt() { return lastRunAt; }

function startScheduler() {
  console.log('⏰  Notification scheduler dimulai (interval: 30 menit)');
  runAll();
  setInterval(runAll, 30 * 60 * 1000);
}

module.exports = { startScheduler, runAll, getLastRunAt };
