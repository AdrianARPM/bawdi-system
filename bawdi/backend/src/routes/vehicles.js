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

module.exports = router;
