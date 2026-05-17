// src/routes/revisions.js  — v8 (dengan PAR flow)
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/revisionController');

router.use(authenticate);

// Draft list
router.get('/draft', ctrl.getDraft);

// Per submission
router.get('/:submissionId',           ctrl.getRevisions);

// Request revisi — buka untuk Operasional juga (untuk Kepala Op pada PAR)
// Controller cek tipe pengajuan dan jabatan
router.post('/:submissionId/request',  authorize('Approval','Verifikator','Admin','Operasional'), ctrl.requestRevision);

router.post('/:submissionId/nota',     ctrl.uploadNota);
router.get('/:submissionId/nota',      ctrl.listNota);
router.put('/:submissionId/payment',   authorize('Approval','Admin'), ctrl.recordPayment);
router.put('/:submissionId/close',     authorize('Approval','Admin'), ctrl.closeSubmission);

// Per snapshot (revisi individual)
router.put('/snapshot/:snapshotId',          authorize('Operasional','Admin'), ctrl.editRevision);
router.put('/snapshot/:snapshotId/submit',   authorize('Operasional','Admin'), ctrl.submitRevision);

// Verify revisi — untuk PR pakai Verifikator, untuk PAR pakai Kepala Op (handled di controller)
router.put('/snapshot/:snapshotId/verify',   authorize('Verifikator','Admin','Operasional'), ctrl.verifyRevision);
router.put('/snapshot/:snapshotId/approve',  authorize('Approval','Admin','Operasional'), ctrl.approveRevision);
router.put('/snapshot/:snapshotId/reject',   authorize('Approval','Verifikator','Admin','Operasional'), ctrl.rejectRevision);

module.exports = router;
