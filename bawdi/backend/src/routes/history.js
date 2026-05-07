// src/routes/history.js
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { getVehicleHistory } = require('../controllers/historyController');

router.use(authenticate);

// GET /api/history/vehicle?kendaraan=B1234XX&keyword=ban
router.get('/vehicle', getVehicleHistory);

module.exports = router;
