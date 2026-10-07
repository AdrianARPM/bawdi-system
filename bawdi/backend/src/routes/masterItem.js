// src/routes/masterItem.js — v1 (Katalog Master Item)
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/masterItemController');

router.use(authenticate);

// Lihat: semua user login (dibutuhkan dropdown form).
router.get('/', ctrl.list);

// Tambah/ubah: Admin (global + semua) & Operasional (khusus cabangnya).
// Pemeriksaan kepemilikan per-cabang dilakukan di controller.
router.post('/',   authorize('Admin', 'Operasional'), ctrl.create);
router.put('/:id', authorize('Admin', 'Operasional'), ctrl.update);

// Seed katalog dari data pengajuan lama (Admin).
router.post('/import', authorize('Admin'), ctrl.importFromHistory);

module.exports = router;
