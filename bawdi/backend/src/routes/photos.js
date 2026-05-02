// src/routes/photos.js
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { upload, list, remove } = require('../controllers/photoController');

router.use(authenticate);
router.post('/:submissionId',  upload);
router.get('/:submissionId',   list);
router.delete('/:photoId',     remove);

module.exports = router;
