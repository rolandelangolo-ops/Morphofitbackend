const { Router } = require('express');
const stylistController = require('../controllers/stylistController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = Router();

router.use(authenticate, requireRole('stylist'));

router.get('/orders', stylistController.orders);
router.get('/clients', stylistController.clients);

module.exports = router;
