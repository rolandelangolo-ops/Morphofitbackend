const { Router } = require('express');
const adminController = require('../controllers/adminController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();

router.use(authenticate, requireRole('admin'));

router.get('/users', adminController.users);
router.get('/orders', adminController.orders);

module.exports = router;
