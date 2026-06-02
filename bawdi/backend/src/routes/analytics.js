// src/routes/analytics.js
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { getAnalytics } = require('../controllers/analyticsController');

router.use(authenticate);
router.get('/', getAnalytics);

module.exports = router;
