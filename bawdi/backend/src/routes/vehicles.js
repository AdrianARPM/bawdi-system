// src/routes/vehicles.js — v10 (Master Data Kendaraan)
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/vehicleController');

router.use(authenticate);

// Semua user login boleh melihat master & laporan (untuk dropdown form, dsb.)
router.get('/',        ctrl.list);
router.get('/report',  ctrl.report);
router.get('/export',  ctrl.exportExcel);

// Kelola master hanya Admin
router.post('/',    authorize('Admin'), ctrl.create);
router.put('/:id',  authorize('Admin'), ctrl.update);

// Kas kecil (v25) — input manual Super Track.
// Akses: Admin, Verifikator, Operasional.
const KAS_ROLES = ['Admin', 'Verifikator', 'Operasional'];
router.post('/kas-kecil',       authorize(...KAS_ROLES), ctrl.createKasKecil);
router.put('/kas-kecil/:id',    authorize(...KAS_ROLES), ctrl.updateKasKecil);
router.delete('/kas-kecil/:id', authorize(...KAS_ROLES), ctrl.deleteKasKecil);

module.exports = router;
