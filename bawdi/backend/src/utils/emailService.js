// src/utils/emailService.js
// Kirim notifikasi email menggunakan nodemailer
// Set env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
const nodemailer = require('nodemailer');
const supabase   = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

// ── Buat transporter SMTP ─────────────────────────────────────────
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[emailService] SMTP tidak dikonfigurasi — email tidak akan dikirim');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(port) || 587,
    secure: Number(port) === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  return transporter;
}

// ── Template email HTML ───────────────────────────────────────────
function buildEmailHTML(subject, message, nomor, actionUrl) {
  return `<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08)">
        
        <!-- Header -->
        <tr><td style="background:#0f172a;padding:24px 32px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><span style="color:#f59e0b;font-size:22px;font-weight:900">BAWDI</span></td>
              <td align="right"><span style="color:#94a3b8;font-size:11px">PT. Bantu Kawal Distribusi</span></td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1e293b">${subject}</p>
          ${nomor ? `<p style="margin:0 0 20px;font-size:13px;color:#f59e0b;font-weight:600">${nomor}</p>` : '<div style="height:20px"></div>'}
          
          <div style="background:#f8fafc;border-radius:12px;padding:16px 20px;border-left:4px solid #f59e0b;margin-bottom:24px">
            <p style="margin:0;font-size:14px;color:#334155;line-height:1.6">${message.replace(/\n/g, '<br>')}</p>
          </div>

          ${actionUrl ? `
          <div align="center" style="margin:24px 0">
            <a href="${actionUrl}" style="background:#f59e0b;color:#fff;padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block">
              Buka Pengajuan →
            </a>
          </div>` : ''}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f1f5f9;padding:16px 32px;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center">
            Email ini dikirim otomatis oleh sistem BAWDI. Jangan balas email ini.<br>
            © ${new Date().getFullYear()} PT. Bantu Kawal Distribusi — Pekanbaru
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Kirim email ke satu user ──────────────────────────────────────
async function sendEmail({ to, subject, message, nomor, submissionId, type }) {
  const t = getTransporter();
  if (!t || !to) return;

  const from      = process.env.EMAIL_FROM || process.env.SMTP_USER;
  const frontendUrl = process.env.FRONTEND_URL || 'https://bawdi-system.vercel.app';
  const actionUrl = submissionId ? `${frontendUrl}/submissions/${submissionId}` : null;

  try {
    await t.sendMail({
      from:    `BAWDI Maintenance <${from}>`,
      to,
      subject: `[BAWDI] ${subject}`,
      html:    buildEmailHTML(subject, message, nomor, actionUrl),
    });

    // Log berhasil
    await supabase.from('email_logs').insert({
      id: uuidv4(), to_email: to, subject: `[BAWDI] ${subject}`,
      type: type || 'notification', submission_id: submissionId || null,
      sent: true, sent_at: new Date().toISOString(),
    }).catch(() => {}); // jangan gagalkan request jika log error

  } catch (err) {
    console.error('[emailService] Gagal kirim ke', to, ':', err.message);
    await supabase.from('email_logs').insert({
      id: uuidv4(), to_email: to, subject: `[BAWDI] ${subject}`,
      type: type || 'notification', submission_id: submissionId || null,
      sent: false, error_msg: err.message,
    }).catch(() => {});
  }
}

// ── Kirim email ke semua user dengan role tertentu ────────────────
async function sendEmailToRole(role, { subject, message, nomor, submissionId, type }) {
  try {
    const { data: users } = await supabase
      .from('users')
      .select('email, email_notif')
      .eq('role', role)
      .eq('is_active', true)
      .eq('email_notif', true);

    if (!users?.length) return;

    // Kirim secara paralel (tidak tunggu satu per satu)
    await Promise.allSettled(
      users.filter(u => u.email).map(u =>
        sendEmail({ to: u.email, subject, message, nomor, submissionId, type })
      )
    );
  } catch (err) {
    console.error('[emailService/sendToRole]', err.message);
  }
}

// ── Kirim email ke user spesifik berdasarkan user_id ─────────────
async function sendEmailToUser(userId, { subject, message, nomor, submissionId, type }) {
  if (!userId) return;
  try {
    const { data: user } = await supabase
      .from('users')
      .select('email, email_notif')
      .eq('id', userId)
      .eq('email_notif', true)
      .single();

    if (!user?.email) return;
    await sendEmail({ to: user.email, subject, message, nomor, submissionId, type });
  } catch (err) {
    console.error('[emailService/sendToUser]', err.message);
  }
}

// ── Template pesan email per jenis notifikasi ─────────────────────
const emailTemplates = {
  new_submission: (nomor, pemohon) => ({
    subject: `Pengajuan Baru Menunggu Verifikasi`,
    message: `Pengajuan baru dari ${pemohon} telah masuk dan menunggu verifikasi Anda.\n\nNomor: ${nomor}\n\nSegera buka sistem untuk memverifikasi pengajuan ini.`,
  }),
  need_approval: (nomor) => ({
    subject: `Pengajuan Menunggu Persetujuan`,
    message: `Pengajuan ${nomor} telah diverifikasi dan menunggu persetujuan Anda.\n\nSilakan buka sistem untuk melihat detail dan memberikan keputusan.`,
  }),
  approved: (nomor) => ({
    subject: `Pengajuan Disetujui ✅`,
    message: `Pengajuan ${nomor} Anda telah DISETUJUI.\n\nSilakan proses pembayaran sesuai prosedur yang berlaku.`,
  }),
  rejected: (nomor, alasan) => ({
    subject: `Pengajuan Ditolak`,
    message: `Pengajuan ${nomor} Anda telah DITOLAK.\n\nAlasan: ${alasan}\n\nSilakan hubungi atasan Anda untuk informasi lebih lanjut.`,
  }),
  revision_request: (nomor, revisiKe, catatan) => ({
    subject: `Pengajuan Perlu Direvisi (Revisi ke-${revisiKe})`,
    message: `Pengajuan ${nomor} Anda perlu direvisi.\n\nCatatan dari verifikator/approval:\n"${catatan}"\n\nSilakan buka sistem, buka tab Revisi-${revisiKe}, dan lakukan perubahan yang diminta.`,
  }),
  revision_done: (nomor, revisiKe) => ({
    subject: `Revisi Selesai — Perlu Verifikasi Ulang`,
    message: `Revisi ke-${revisiKe} pengajuan ${nomor} telah selesai dikirim oleh pemohon.\n\nSilakan buka sistem untuk memverifikasi ulang pengajuan yang sudah direvisi.`,
  }),
  overdue_2days: (nomor, hariLalu) => ({
    subject: `⚠ Pengajuan Belum Ada Kejelasan (${hariLalu} hari)`,
    message: `Pengajuan ${nomor} sudah ${hariLalu} hari belum ada tindak lanjut!\n\nStatus pengajuan ini masih menunggu. Mohon segera ditindaklanjuti.`,
  }),
  deadline_approaching: (nomor, tgl, total) => ({
    subject: `🔔 Reminder: Batas Akhir Pembayaran Mendekati`,
    message: `Batas akhir pembayaran pengajuan ${nomor} adalah ${tgl}.\n\nTotal yang harus dibayar: ${total}\n\nSegera proses pembayaran sebelum tanggal jatuh tempo.`,
  }),
  payment_recorded: (nomor, total) => ({
    subject: `💰 Pembayaran Dicatat`,
    message: `Pembayaran pengajuan ${nomor} sebesar ${total} telah dicatat dalam sistem.`,
  }),
  submission_closed: (nomor) => ({
    subject: `🏁 Pengajuan Selesai & Diarsipkan`,
    message: `Pengajuan ${nomor} telah ditutup dan disimpan ke arsip/draft.\n\nProses pengajuan ini telah selesai.`,
  }),
};

module.exports = { sendEmail, sendEmailToRole, sendEmailToUser, emailTemplates };
