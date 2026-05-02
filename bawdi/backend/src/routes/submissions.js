// src/routes/submissions.js  — v2
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/submissionController');

router.use(authenticate);
router.get('/stats',              ctrl.stats);
router.get('/',                   ctrl.list);
router.get('/:id',                ctrl.getOne);
router.post('/',                  authorize('Operasional','Admin'), ctrl.create);
router.put('/:id/verify',         authorize('Verifikator','Admin'), ctrl.verify);
router.put('/:id/approve',        authorize('Approval','Admin'),    ctrl.approve);
router.put('/:id/reject',         authorize('Approval','Verifikator','Admin'), ctrl.reject);
router.put('/:id/select-vendor',  authorize('Approval','Admin'),    ctrl.selectVendor);

module.exports = router;
