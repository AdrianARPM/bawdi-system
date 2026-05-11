// src/utils/notifScheduler.js  — v7 (dengan email notifications)
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');
const { sendEmailToUser, sendEmailToRole, emailTemplates } = require('./emailService');

async function notifyUser(userId, submissionId, type, message) {
  if (!userId) return;
  await supabase.from('notifications').insert({
    id: uuidv4(), user_id: userId, submission_id: submissionId, type, message, is_read: false
  });
}

async function notifyRole(role, submissionId, type, message) {
  const { data: users } = await supabase.from('users').select('id').eq('role', role).eq('is_active', true);
  if (!users?.length) return;
  await supabase.from('notifications').insert(
    users.map(u => ({ id: uuidv4(), user_id: u.id, submission_id: submissionId, type, message, is_read: false }))
  );
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

async function runAll() { await checkOverdue(); await checkDeadlines(); }

function startScheduler() {
  console.log('⏰  Notification scheduler dimulai (interval: 30 menit)');
  runAll();
  setInterval(runAll, 30 * 60 * 1000);
}

module.exports = { startScheduler, runAll };
