const { Router } = require('express');
const clientController = require('../controllers/clientController');
const bodyScanController = require('../controllers/bodyScanController');
const { authenticate, requireRole } = require('../middleware/auth');
const { uploadBodyScanPhotos } = require('../middleware/upload');
const validate = require('../middleware/validate');
const { createOrder, clientUpdateOrder } = require('../validators/orderValidators');
const { saveMeasurements } = require('../validators/measurementValidators');

const router = Router();

router.use(authenticate, requireRole('client'));

router.get('/measurements', clientController.measurements);
router.post('/measurements', validate(saveMeasurements), clientController.saveMeasurements);
router.get('/measurements/history', bodyScanController.history);
router.delete('/measurements/:id/photos', bodyScanController.deleteScanPhotos);
router.post('/body-scans/drafts', uploadBodyScanPhotos, bodyScanController.createDraft);
router.post('/body-scans/drafts/:id/analyze', bodyScanController.analyzeDraft);
router.get('/orders', clientController.orders);
router.post('/orders', validate(createOrder), clientController.createOrder);
router.patch('/orders/:id', validate(clientUpdateOrder), clientController.updateOrder);

module.exports = router;
