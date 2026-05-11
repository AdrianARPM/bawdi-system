// src/utils/emailService.js  — FIXED
// Email logs insert dibuat aman (tidak crash jika tabel belum ada)
const nodemailer = require('nodemailer');
const supabase   = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

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
    host, port: Number(port) || 587,
    secure: Number(port) === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
  return transporter;
}

function buildEmailHTML(subject, message, nomor, actionUrl) {
  return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08)">
      <tr><td style="background:#0f172a;padding:24px 32px">
        <span style="color:#f59e0b;font-size:22px;font-weight:900">BAWDI</span>
        <span style="color:#94a3b8;font-size:11px;margin-left:12px">PT. Bantu Kawal Distribusi</span>
      </td></tr>
      <tr><td style="padding:32px">
        <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1e293b">${subject}</p>
        ${nomor ? `<p style="margin:0 0 16px;font-size:13px;color:#f59e0b;font-weight:600">${nomor}</p>` : '<div style="height:16px"></div>'}
        <div style="background:#f8fafc;border-radius:12px;padding:16px 20px;border-left:4px solid #f59e0b;margin-bottom:24px">
          <p style="margin:0;font-size:14px;color:#334155;line-height:1.6">${message.replace(/\n/g, '<br>')}</p>
        </div>
        ${actionUrl ? `<div align="center"><a href="${actionUrl}" style="background:#f59e0b;color:#fff;padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block">Buka Pengajuan →</a></div>` : ''}
      </td></tr>
      <tr><td style="background:#f1f5f9;padding:16px 32px;border-top:1px solid #e2e8f0">
        <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center">Email otomatis dari sistem BAWDI. Jangan balas email ini.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

async function sendEmail({ to, subject, message, nomor, submissionId, type }) {
  const t = getTransporter();
  if (!t || !to) return;
  const from       = process.env.EMAIL_FROM || process.env.SMTP_USER;
  const frontendUrl = process.env.FRONTEND_URL || 'https://bawdi-system.vercel.app';
  const actionUrl  = submissionId ? `${frontendUrl}/submissions/${submissionId}` : null;
  try {
    await t.sendMail({
      from: `BAWDI Maintenance <${from}>`,
      to, subject: `[BAWDI] ${subject}`,
      html: buildEmailHTML(subject, message, nomor, actionUrl),
    });
    // Log aman — tidak crash jika tabel belum ada
    supabase.from('email_logs').insert({
      id: uuidv4(), to_email: to, subject: `[BAWDI] ${subject}`,
      type: type || 'notification', submission_id: submissionId || null,
      sent: true, sent_at: new Date().toISOString(),
    }).then().catch(() => {}); // silent fail
  } catch (err) {
    console.error('[emailService] Gagal kirim ke', to, ':', err.message);
    supabase.from('email_logs').insert({
      id: uuidv4(), to_email: to, subject: `[BAWDI] ${subject}`,
      type: type || 'notification', submission_id: submissionId || null,
      sent: false, error_msg: err.message,
    }).then().catch(() => {}); // silent fail
  }
}

async function sendEmailToRole(role, { subject, message, nomor, submissionId, type }) {
  try {
    const { data: users } = await supabase
      .from('users').select('email, email_notif')
      .eq('role', role).eq('is_active', true).eq('email_notif', true);
    if (!users?.length) return;
    await Promise.allSettled(
      users.filter(u => u.email).map(u =>
        sendEmail({ to: u.email, subject, message, nomor, submissionId, type })
      )
    );
  } catch (err) { console.error('[emailService/sendToRole]', err.message); }
}

async function sendEmailToUser(userId, { subject, message, nomor, submissionId, type }) {
  if (!userId) return;
  try {
    const { data: user } = await supabase
      .from('users').select('email, email_notif')
      .eq('id', userId).eq('email_notif', true).single();
    if (!user?.email) return;
    await sendEmail({ to: user.email, subject, message, nomor, submissionId, type });
  } catch (err) { console.error('[emailService/sendToUser]', err.message); }
}

const emailTemplates = {
  new_submission:      (nomor, pemohon)    => ({ subject: `Pengajuan Baru Menunggu Verifikasi`,             message: `Pengajuan baru dari ${pemohon} (${nomor}) menunggu verifikasi Anda.` }),
  need_approval:       (nomor)             => ({ subject: `Pengajuan Menunggu Persetujuan`,                  message: `Pengajuan ${nomor} telah diverifikasi dan menunggu persetujuan Anda.` }),
  approved:            (nomor)             => ({ subject: `Pengajuan Disetujui ✅`,                          message: `Pengajuan ${nomor} Anda telah DISETUJUI. Silakan proses pembayaran.` }),
  rejected:            (nomor, alasan)     => ({ subject: `Pengajuan Ditolak`,                               message: `Pengajuan ${nomor} ditolak.\nAlasan: ${alasan}` }),
  revision_request:    (nomor, ke, catatan)=> ({ subject: `Pengajuan Perlu Direvisi (Revisi ke-${ke})`,      message: `Pengajuan ${nomor} perlu direvisi.\nCatatan: "${catatan}"` }),
  revision_done:       (nomor, ke)         => ({ subject: `Revisi Selesai — Perlu Verifikasi Ulang`,         message: `Revisi ke-${ke} pengajuan ${nomor} sudah selesai dikirim.` }),
  overdue_2days:       (nomor, hari)       => ({ subject: `⚠ Pengajuan Belum Ada Kejelasan (${hari} hari)`, message: `Pengajuan ${nomor} sudah ${hari} hari belum ditindaklanjuti!` }),
  deadline_approaching:(nomor, tgl, total) => ({ subject: `🔔 Reminder: Batas Akhir Pembayaran Mendekati`,  message: `Batas akhir pembayaran ${nomor} adalah ${tgl}.\nTotal: ${total}` }),
  payment_recorded:    (nomor, total)      => ({ subject: `💰 Pembayaran Dicatat`,                           message: `Pembayaran ${nomor} sebesar ${total} telah dicatat.` }),
  submission_closed:   (nomor)             => ({ subject: `🏁 Pengajuan Selesai & Diarsipkan`,               message: `Pengajuan ${nomor} telah ditutup dan disimpan ke arsip.` }),
};

module.exports = { sendEmail, sendEmailToRole, sendEmailToUser, emailTemplates };
