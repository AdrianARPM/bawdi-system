// src/routes/users.js
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const supabase = require('../../config/supabase');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('../utils/auditLogger');

router.use(authenticate);

// GET /api/users — list semua user (Admin only)
router.get('/', authorize('Admin'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, nik, name, role, jabatan, cabang, is_active, last_login, created_at')
      .order('created_at');
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data pengguna' });
  }
});

// POST /api/users — tambah user baru (Admin only)
router.post('/', authorize('Admin'), async (req, res) => {
  try {
    const { nik, name, role, jabatan, cabang } = req.body;
    if (!nik || !name || !role) return res.status(400).json({ error: 'NIK, nama, dan role wajib diisi' });

    // Cek NIK sudah ada
    const { data: exist } = await supabase.from('users').select('id').eq('nik', nik).single();
    if (exist) return res.status(409).json({ error: 'NIK sudah terdaftar' });

    // Default password = NIK
    const password_hash = await bcrypt.hash(nik, 12);
    const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

    const { error } = await supabase.from('users').insert({
      id: uuidv4(), nik, name, role, jabatan: jabatan || '', cabang: cabang || '',
      password_hash, avatar_initials: initials, is_active: true, must_change_password: true,
    });
    if (error) throw error;

    logAudit(req, { action: 'user_buat', target: name, detail: `role ${role}${jabatan ? ', ' + jabatan : ''}` });
    res.status(201).json({ message: `User ${name} berhasil ditambahkan. Password default = NIK (${nik})` });
  } catch (err) {
    console.error('[users/create]', err);
    res.status(500).json({ error: 'Gagal menambahkan user' });
  }
});

// PUT /api/users/:id/toggle-active — aktif/nonaktif user (Admin only)
router.put('/:id/toggle-active', authorize('Admin'), async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('is_active, name').eq('id', req.params.id).single();
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    await supabase.from('users').update({ is_active: !user.is_active }).eq('id', req.params.id);
    logAudit(req, { action: 'user_toggle', target: user.name, detail: user.is_active ? 'dinonaktifkan' : 'diaktifkan' });
    res.json({ message: `User ${user.name} berhasil di${user.is_active ? 'nonaktifkan' : 'aktifkan'}` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memperbarui status user' });
  }
});

// PUT /api/users/:id/reset-password — reset ke NIK (Admin only)
router.put('/:id/reset-password', authorize('Admin'), async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('nik, name').eq('id', req.params.id).single();
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    const hash = await bcrypt.hash(user.nik, 12);
    await supabase.from('users').update({ password_hash: hash, must_change_password: true }).eq('id', req.params.id);
    logAudit(req, { action: 'user_reset_password', target: user.name });
    res.json({ message: `Password ${user.name} direset ke NIK (${user.nik})` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mereset password' });
  }
});

module.exports = router;
