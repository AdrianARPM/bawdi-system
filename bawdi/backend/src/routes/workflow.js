// src/routes/workflow.js — v1 (Pengaturan Alur Persetujuan PR/PAR per cabang)
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/workflowController');

router.use(authenticate);
router.get('/',  authorize('Admin'), ctrl.list);
router.put('/',  authorize('Admin'), ctrl.upsert);

module.exports = router;
