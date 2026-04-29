// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../../config/supabase');

/**
 * POST /api/auth/login
 * Body: { nik, password }
 * Password default = NIK itu sendiri (admin wajib ganti setelah pertama login)
 */
async function login(req, res) {
  try {
    const { nik, password } = req.body;
    if (!nik || !password) {
      return res.status(400).json({ error: 'NIK dan password wajib diisi' });
    }

    // Ambil user berdasarkan NIK
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('nik', nik.trim())
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'NIK tidak ditemukan dalam sistem' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Akun Anda telah dinonaktifkan. Hubungi Admin.' });
    }

    // Verifikasi password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Password salah' });
    }

    // Update last login
    await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', user.id);

    // Generate JWT
    const payload = {
      id: user.id,
      nik: user.nik,
      name: user.name,
      role: user.role,
      jabatan: user.jabatan,
      cabang: user.cabang,
      avatar: user.avatar_initials,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        nik: user.nik,
        name: user.name,
        role: user.role,
        jabatan: user.jabatan,
        cabang: user.cabang,
        avatar: user.avatar_initials,
        mustChangePassword: user.must_change_password,
      }
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
}

/**
 * GET /api/auth/me
 * Mengembalikan profil user yang sedang login
 */
async function getMe(req, res) {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, nik, name, role, jabatan, cabang, avatar_initials, last_login, must_change_password')
      .eq('id', req.user.id)
      .single();

    if (error || !user) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
}

/**
 * PUT /api/auth/change-password
 * Body: { oldPassword, newPassword }
 */
async function changePassword(req, res) {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
    }

    const { data: user } = await supabase.from('users').select('password_hash').eq('id', req.user.id).single();
    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Password lama salah' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await supabase.from('users').update({ password_hash: newHash, must_change_password: false }).eq('id', req.user.id);

    res.json({ message: 'Password berhasil diubah' });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
}

module.exports = { login, getMe, changePassword };
