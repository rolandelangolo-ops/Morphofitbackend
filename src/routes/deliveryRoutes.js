const { Router } = require('express');
const deliveryController = require('../controllers/deliveryController');
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { updateOrderStatus } = require('../validators/orderValidators');

const router = Router();

router.use(authenticate, requireRole('delivery_agent'));

router.get('/orders', deliveryController.orders);
router.patch('/orders/:id/status', validate(updateOrderStatus), deliveryController.updateStatus);

module.exports = router;
