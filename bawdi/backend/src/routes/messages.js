// src/routes/messages.js
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { list, send } = require('../controllers/messageController');

router.use(authenticate);
router.get('/:submissionId',  list);
router.post('/:submissionId', send);

module.exports = router;
