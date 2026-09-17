// src/routes/laporan.js — v1 (Laporan Akunting)
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/laporanController');

router.use(authenticate, authorize('Admin', 'Verifikator'));

router.get('/daftar-transaksi', ctrl.daftarTransaksi);
router.get('/pph23',            ctrl.rekapPph23);

module.exports = router;
