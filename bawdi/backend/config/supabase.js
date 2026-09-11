// config/supabase.js
// Polyfill WebSocket untuk Node < 22 (mis. Railway pakai Node 18).
// @supabase/realtime-js v2.11+ mengonstruksi client realtime saat createClient
// dan butuh `WebSocket` global — di Node 18 belum ada, jadi startup crash.
// Backend ini tidak memakai realtime, tapi client tetap dikonstruksi, maka
// kita sediakan implementasinya dari paket 'ws'. Di Node 22+ (yang sudah punya
// WebSocket global) baris ini dilewati.
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = require('ws');
}

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌  SUPABASE_URL dan SUPABASE_SERVICE_KEY wajib diisi di .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

module.exports = supabase;
