// src/routes/kalender.js — v1 (Catatan Kalender Bayar)
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/kalenderController');

router.use(authenticate);

// Catatan hanya untuk Admin/Verifikator/Approval (Operasional/Pengawas: dinonaktifkan dulu).
const NOTE_ROLES = ['Admin', 'Verifikator', 'Approval'];
router.get('/notes',        authorize(...NOTE_ROLES), ctrl.listNotes);
router.post('/notes',       authorize(...NOTE_ROLES), ctrl.createNote);
router.delete('/notes/:id', authorize(...NOTE_ROLES), ctrl.deleteNote);

module.exports = router;
