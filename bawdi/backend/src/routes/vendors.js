// src/routes/vendors.js — v1 (Master Data Vendor / Supplier)
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/vendorController');

router.use(authenticate);

// Semua user login boleh melihat daftar vendor (dibutuhkan autofill form).
router.get('/', ctrl.list);

// Tambah vendor: Admin & Operasional (pemohon sering perlu daftarkan vendor baru).
router.post('/',   authorize('Admin', 'Operasional'), ctrl.create);
// Edit / nonaktifkan: tetap khusus Admin (jaga kualitas data).
router.put('/:id', authorize('Admin'), ctrl.update);

module.exports = router;
