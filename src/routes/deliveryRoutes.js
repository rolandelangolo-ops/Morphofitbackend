const { Router } = require('express');
const deliveryController = require('../controllers/deliveryController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();

router.use(authenticate, requireRole('delivery_agent'));

router.get('/orders', deliveryController.orders);

module.exports = router;
