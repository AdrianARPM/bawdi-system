// src/controllers/authController.js  — v7 (login pakai email)
const supabase = require('../../config/supabase');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET || 'bawdi_secret_2024';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

// ── POST /api/auth/login ──────────────────────────────────────────
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email?.trim() || !password)
      return res.status(400).json({ error: 'Email dan password wajib diisi' });

    // Cari user berdasarkan email
    const { data: user, error } = await supabase
      .from('users')
      .select('id, nik, name, email, role, jabatan, cabang, avatar_initials, is_active, password_hash')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (error || !user)
      return res.status(401).json({ error: 'Email atau password salah' });

    if (!user.is_active)
      return res.status(403).json({ error: 'Akun Anda tidak aktif. Hubungi Admin.' });

    // Verifikasi password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Email atau password salah' });

    // Buat JWT
    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    const { password_hash, ...userClean } = user;
    res.json({ token, user: userClean });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
}

// ── GET /api/auth/me ──────────────────────────────────────────────
async function getMe(req, res) {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, nik, name, email, role, jabatan, cabang, avatar_initials, is_active, email_notif')
      .eq('id', req.user.id)
      .single();

    if (error || !user) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
}

// ── PUT /api/auth/change-password ─────────────────────────────────
async function changePassword(req, res) {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password)
      return res.status(400).json({ error: 'Password lama dan baru wajib diisi' });
    if (new_password.length < 6)
      return res.status(400).json({ error: 'Password baru minimal 6 karakter' });

    const { data: user } = await supabase
      .from('users').select('password_hash').eq('id', req.user.id).single();

    const valid = await bcrypt.compare(old_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Password lama salah' });

    const newHash = await bcrypt.hash(new_password, 12);
    await supabase.from('users').update({ password_hash: newHash }).eq('id', req.user.id);

    res.json({ message: 'Password berhasil diubah' });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
}

// ── PUT /api/auth/email-notif ─────────────────────────────────────
// Toggle notifikasi email
async function toggleEmailNotif(req, res) {
  try {
    const { email_notif } = req.body;
    await supabase.from('users')
      .update({ email_notif: !!email_notif })
      .eq('id', req.user.id);
    res.json({ message: `Notifikasi email ${email_notif ? 'diaktifkan' : 'dinonaktifkan'}` });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
}

module.exports = { login, getMe, changePassword, toggleEmailNotif };
