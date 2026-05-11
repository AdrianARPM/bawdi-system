// src/routes/auth.js  — v7
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { login, getMe, changePassword, toggleEmailNotif } = require('../controllers/authController');

router.post('/login',          login);
router.get('/me',              authenticate, getMe);
router.put('/change-password', authenticate, changePassword);
router.put('/email-notif',     authenticate, toggleEmailNotif);

module.exports = router;
