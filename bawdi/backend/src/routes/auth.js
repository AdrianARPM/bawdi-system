// src/routes/auth.js  — v7 safe
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/authController');

router.post('/login',          ctrl.login);
router.get('/me',              authenticate, ctrl.getMe);
router.put('/change-password', authenticate, ctrl.changePassword);

// Toggle email notif — hanya jika fungsi tersedia
if (ctrl.toggleEmailNotif) {
  router.put('/email-notif', authenticate, ctrl.toggleEmailNotif);
}

module.exports = router;
