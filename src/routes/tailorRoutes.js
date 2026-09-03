const { Router } = require('express');
const tailorController = require('../controllers/tailorController');
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { updateOrderStatus } = require('../validators/orderValidators');

const router = Router();

router.use(authenticate);

router.get('/orders', requireRole('tailor'), tailorController.orders);
router.patch('/orders/:id/status', requireRole('tailor', 'admin'), validate(updateOrderStatus), tailorController.updateStatus);

module.exports = router;
