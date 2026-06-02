// src/routes/submissions.js  — v8 (dengan PAR flow)
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/submissionController');

router.use(authenticate);

router.get('/stats', ctrl.stats);
router.get('/',      ctrl.list);
router.get('/:id',   ctrl.getOne);
router.get('/overdue-action', ctrl.overdueForAction);
router.post('/', authorize('Operasional', 'Admin'), ctrl.create);

// Verify hanya untuk PR — controller cek tipe & role
router.put('/:id/verify',  authorize('Verifikator', 'Admin'), ctrl.verify);

// Approve & Reject — buka untuk Operasional juga (untuk Kepala Op pada PAR)
// Controller akan cek tipe dan jabatan yang sesuai
router.put('/:id/approve', authorize('Approval', 'Admin', 'Operasional'), ctrl.approve);
router.put('/:id/reject',  authorize('Approval', 'Verifikator', 'Admin', 'Operasional'), ctrl.reject);

router.put('/:id/select-vendor', authorize('Approval', 'Admin'), ctrl.selectVendor);

module.exports = router;
