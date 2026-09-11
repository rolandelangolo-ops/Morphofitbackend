const { Router } = require('express');
const usersController = require('../controllers/usersController');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { uploadAvatar } = require('../middleware/upload');
const { updateProfile, changePassword, searchUsers } = require('../validators/userValidators');

const router = Router();

router.use(authenticate);

router.get('/me', usersController.me);
router.patch('/me', validate(updateProfile), usersController.updateMe);
router.post('/me/avatar', uploadAvatar, usersController.uploadAvatarHandler);
router.post('/me/password', validate(changePassword), usersController.changePassword);
router.get('/me/export', usersController.exportData);
router.post('/me/deactivate', usersController.deactivate);
router.get('/search', validate(searchUsers, 'query'), usersController.search);
router.get('/:id', usersController.getById);

module.exports = router;
