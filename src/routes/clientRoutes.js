const { Router } = require('express');
const clientController = require('../controllers/clientController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();

router.use(authenticate, requireRole('client'));

router.get('/measurements', clientController.measurements);
router.get('/orders', clientController.orders);

module.exports = router;
