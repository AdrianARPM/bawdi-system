// src/routes/history.js  — v2
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { getVehicleHistory, getLastKM } = require('../controllers/historyController');

router.use(authenticate);

// GET /api/history/vehicle?kendaraan=BM1234XX
router.get('/vehicle', getVehicleHistory);

// GET /api/history/last-km?kendaraan=BM1234XX
// Auto-fill KM terakhir + tanggal untuk form pengajuan baru
router.get('/last-km', getLastKM);

module.exports = router;
