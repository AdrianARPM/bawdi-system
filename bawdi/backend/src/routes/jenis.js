// src/routes/jenis.js — v1 (Master Jenis Pembelian / Beban)
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/jenisController');

router.use(authenticate);

// Semua user login boleh melihat daftar jenis (dibutuhkan dropdown form).
router.get('/', ctrl.list);

// Kelola master hanya Admin.
router.post('/',   authorize('Admin'), ctrl.create);
router.put('/:id', authorize('Admin'), ctrl.update);

module.exports = router;
