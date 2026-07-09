// src/utils/auditLogger.js — pencatat jejak audit BAWDI
// Fire-and-forget: tidak pernah melempar error & tidak memblokir respons.
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');

/**
 * logAudit(req, { action, target, submissionId, detail })
 * - action  : kode aksi (verifikasi, setujui, tolak, dp, bayar, tutup_arsip, hapus_nota,
 *             batalkan, hapus_permanen, revisi_*, user_*)
 * - target  : nomor pengajuan / nama user yang terdampak
 * - detail  : keterangan bebas (alasan, nominal, dll)
 */
async function logAudit(req, { action, target = null, submissionId = null, detail = null }) {
  try {
    await supabase.from('audit_logs').insert({
      id:            uuidv4(),
      user_id:       req.user?.id || null,
      user_name:     req.user?.name || null,
      action,
      target,
      submission_id: submissionId,
      detail,
    });
  } catch (e) {
    console.error('[audit]', e.message);
  }
}

module.exports = { logAudit };
