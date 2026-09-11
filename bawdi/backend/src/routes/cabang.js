// src/routes/cabang.js — v1 (Master Data Cabang / Project)
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/cabangController');

router.use(authenticate);

// Semua user login boleh melihat daftar cabang (dibutuhkan dropdown form).
router.get('/', ctrl.list);

// Kelola master hanya Admin.
router.post('/',   authorize('Admin'), ctrl.create);
router.put('/:id', authorize('Admin'), ctrl.update);

module.exports = router;
