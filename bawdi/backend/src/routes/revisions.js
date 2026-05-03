// src/routes/revisions.js
const router  = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl    = require('../controllers/revisionController');

router.use(authenticate);

// Draft list (semua role bisa lihat)
router.get('/draft', ctrl.getDraft);

// Per submission
router.get('/:submissionId',              ctrl.getRevisions);
router.post('/:submissionId/request',     authorize('Approval','Verifikator','Admin'), ctrl.requestRevision);
router.put('/:submissionId/submit',       authorize('Operasional','Admin'),            ctrl.submitRevision);
router.post('/:submissionId/nota',        ctrl.uploadNota);
router.get('/:submissionId/nota',         ctrl.listNota);
router.put('/:submissionId/payment',      authorize('Approval','Admin'),               ctrl.recordPayment);
router.put('/:submissionId/close',        authorize('Approval','Admin'),               ctrl.closeSubmission);

module.exports = router;
