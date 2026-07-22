// src/routes/submissions.js  — v8 (dengan PAR flow)
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/submissionController');

router.use(authenticate);

router.get('/stats', ctrl.stats);
router.get('/overdue-action', ctrl.overdueForAction);
router.post('/check-duplicate', ctrl.checkDuplicate);
router.get('/',      ctrl.list);
router.get('/:id',   ctrl.getOne);

router.post('/', authorize('Operasional', 'Admin'), ctrl.create);

// Verify hanya untuk PR — controller cek tipe & role
router.put('/:id/verify',  authorize('Verifikator', 'Admin', 'Operasional'), ctrl.verify);
// Approve & Reject — buka untuk Operasional juga (untuk Kepala Op pada PAR)
// Controller akan cek tipe dan jabatan yang sesuai 
//Request payment dan Verification
router.put('/:id/approve', authorize('Approval', 'Admin', 'Operasional'), ctrl.approve);
router.put('/:id/request-payment', authorize('Operasional', 'Admin'), ctrl.requestPayment);
router.put('/:id/request-verification', authorize('Operasional', 'Admin'), ctrl.requestVerification);
router.put('/:id/tunda', authorize('Verifikator', 'Approval', 'Admin'), ctrl.tundaSubmission);
router.put('/:id/reject',  authorize('Approval', 'Verifikator', 'Admin', 'Operasional'), ctrl.reject);

router.put('/:id/select-vendor', authorize('Approval', 'Admin'), ctrl.selectVendor);

// Zona Admin: batalkan (soft) & hapus permanen — keduanya tercatat di audit log
router.put('/:id/cancel', authorize('Admin'), ctrl.cancelSubmission);
router.delete('/:id',     authorize('Admin'), ctrl.hardDeleteSubmission);

module.exports = router;
