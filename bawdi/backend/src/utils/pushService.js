// src/utils/pushService.js — Web Push (VAPID) untuk BAWDI
// Semua fungsi fire-and-forget & tidak pernah melempar error:
// jika VAPID belum dikonfigurasi / paket belum terpasang, push dilewati diam-diam.
const supabase = require('../../config/supabase');

let webpush = null;
let configured = false;

function ensureReady() {
  if (configured) return true;
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false; // belum dikonfigurasi → skip senyap
  try {
    webpush = require('web-push');
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@bawdi.web.id', pub, priv);
    configured = true;
    return true;
  } catch (e) {
    console.error('[push] web-push tidak tersedia:', e.message);
    return false;
  }
}

// Kirim ke sekumpulan baris subscription; hapus otomatis yang sudah mati (404/410)
async function sendToSubscriptions(rows, payload) {
  if (!rows?.length) return;
  const body = JSON.stringify(payload);
  await Promise.allSettled(rows.map(async (r) => {
    try {
      await webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        body
      );
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Subscription kadaluarsa (user cabut izin / ganti browser) → bersihkan
        await supabase.from('push_subscriptions').delete().eq('endpoint', r.endpoint);
      }
    }
  }));
}

async function sendPushToUserIds(userIds, { title = 'BAWDI', body = '', submissionId = null } = {}) {
  try {
    if (!userIds?.length || !ensureReady()) return;
    const { data } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .in('user_id', userIds);
    await sendToSubscriptions(data, { title, body, submissionId });
  } catch (e) { console.error('[push/userIds]', e.message); }
}

async function sendPushToUser(userId, payload) {
  if (!userId) return;
  return sendPushToUserIds([userId], payload);
}

async function sendPushToRole(role, payload) {
  try {
    if (!ensureReady()) return;
    const { data: users } = await supabase
      .from('users').select('id').eq('role', role).eq('is_active', true);
    if (!users?.length) return;
    await sendPushToUserIds(users.map(u => u.id), payload);
  } catch (e) { console.error('[push/role]', e.message); }
}

async function sendPushToJabatan(jabatan, payload) {
  try {
    if (!ensureReady()) return;
    const { data: users } = await supabase
      .from('users').select('id').eq('jabatan', jabatan).eq('is_active', true);
    if (!users?.length) return;
    await sendPushToUserIds(users.map(u => u.id), payload);
  } catch (e) { console.error('[push/jabatan]', e.message); }
}

module.exports = { sendPushToUser, sendPushToUserIds, sendPushToRole, sendPushToJabatan };
