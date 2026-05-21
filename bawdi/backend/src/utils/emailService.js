// src/utils/emailService.js  — versi Resend (HTTP API, anti SMTP-timeout)
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM      = process.env.EMAIL_FROM || 'BAWDI <onboarding@resend.dev>';
const FRONTEND_URL    = process.env.FRONTEND_URL || 'https://bawdi-system.vercel.app';

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

// Log aman ke email_logs (silent fail jika tabel tidak ada)
function logEmail({ to, subject, type, submissionId, sent, errorMsg }) {
  supabase.from('email_logs').insert({
    id: uuidv4(), to_email: to, subject,
    type: type || 'notification', submission_id: submissionId || null,
    sent, sent_at: sent ? new Date().toISOString() : null,
    error_msg: errorMsg || null,
  }).then().catch(() => {});
}

// ── Kirim 1 email via Resend HTTP API ──────────────────────────────
async function sendEmail({ to, subject, message, nomor, submissionId, type }) {
  if (!RESEND_API_KEY) {
    console.warn('[emailService] RESEND_API_KEY belum diset — email dilewati');
    return;
  }
  if (!to) return;

  const actionUrl   = submissionId ? `${FRONTEND_URL}/submissions/${submissionId}` : null;
  const fullSubject = `[BAWDI] ${subject}`;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject: fullSubject,
        html: buildEmailHTML(subject, message, nomor, actionUrl),
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Resend ${resp.status}: ${errText}`);
    }

    logEmail({ to, subject: fullSubject, type, submissionId, sent: true });
  } catch (err) {
    console.error('[emailService] Gagal kirim ke', to, ':', err.message);
    logEmail({ to, subject: fullSubject, type, submissionId, sent: false, errorMsg: err.message });
  }
}

// ── Kirim ke semua user dengan role tertentu ───────────────────────
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

// ── Kirim ke 1 user spesifik ───────────────────────────────────────
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
