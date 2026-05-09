// src/routes/revisions.js  — v6
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/revisionController');

router.use(authenticate);

// Draft list
router.get('/draft', ctrl.getDraft);

// Per submission
router.get('/:submissionId',           ctrl.getRevisions);
router.post('/:submissionId/request',  authorize('Approval','Verifikator','Admin'), ctrl.requestRevision);
router.post('/:submissionId/nota',     ctrl.uploadNota);
router.get('/:submissionId/nota',      ctrl.listNota);
router.put('/:submissionId/payment',   authorize('Approval','Admin'), ctrl.recordPayment);
router.put('/:submissionId/close',     authorize('Approval','Admin'), ctrl.closeSubmission);

// Per snapshot (revisi individual)
router.put('/snapshot/:snapshotId',          authorize('Operasional','Admin'), ctrl.editRevision);
router.put('/snapshot/:snapshotId/submit',   authorize('Operasional','Admin'), ctrl.submitRevision);
router.put('/snapshot/:snapshotId/verify',   authorize('Verifikator','Admin'), ctrl.verifyRevision);
router.put('/snapshot/:snapshotId/approve',  authorize('Approval','Admin'),    ctrl.approveRevision);
router.put('/snapshot/:snapshotId/reject',   authorize('Approval','Verifikator','Admin'), ctrl.rejectRevision);

module.exports = router;
