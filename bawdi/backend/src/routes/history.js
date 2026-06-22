// src/routes/history.js  — v3
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { getVehicleHistory, getLastKM, getVehicleItems } = require('../controllers/historyController');

router.use(authenticate);

// GET /api/history/vehicle?kendaraan=BM1234XX
router.get('/vehicle', getVehicleHistory);

// GET /api/history/last-km?kendaraan=BM1234XX&keyword=...
// Auto-fill KM terakhir + tanggal (v17: cocok SAMA-PERSIS)
router.get('/last-km', getLastKM);

// GET /api/history/items?kendaraan=BM1234XX  (v17)
// Daftar item unik utk autocomplete penjelasan di form
router.get('/items', getVehicleItems);

module.exports = router;
