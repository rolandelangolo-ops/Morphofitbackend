const { Router } = require('express');
const notificationsController = require('../controllers/notificationsController');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.use(authenticate);

router.get('/', notificationsController.list);
router.get('/unread-count', notificationsController.unreadCount);
router.patch('/read-all', notificationsController.markAllRead);
router.patch('/:id/read', notificationsController.markRead);

module.exports = router;
