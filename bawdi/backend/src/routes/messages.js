// src/routes/messages.js
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { list, send, unreadMap, markRead } = require('../controllers/messageController');

router.use(authenticate);
router.get('/unread-map',          unreadMap);   // sebelum '/:submissionId'
router.put('/:submissionId/read',  markRead);
router.get('/:submissionId',       list);
router.post('/:submissionId',      send);

module.exports = router;
