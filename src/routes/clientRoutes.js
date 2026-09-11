const { Router } = require('express');
const clientController = require('../controllers/clientController');
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createOrder, clientUpdateOrder } = require('../validators/orderValidators');
const { saveMeasurements } = require('../validators/measurementValidators');

const router = Router();

router.use(authenticate, requireRole('client'));

router.get('/measurements', clientController.measurements);
router.post('/measurements', validate(saveMeasurements), clientController.saveMeasurements);
router.get('/orders', clientController.orders);
router.post('/orders', validate(createOrder), clientController.createOrder);
router.patch('/orders/:id', validate(clientUpdateOrder), clientController.updateOrder);

module.exports = router;
