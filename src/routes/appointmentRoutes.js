const { Router } = require('express');
const appointmentController = require('../controllers/appointmentController');
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createAppointment, updateAppointmentStatus } = require('../validators/appointmentValidators');

const router = Router();

router.use(authenticate);

router.get('/tailors', requireRole('client'), appointmentController.listTailors);
router.get('/', appointmentController.list);
router.post('/', requireRole('client'), validate(createAppointment), appointmentController.create);
router.patch('/:id/status', requireRole('tailor'), validate(updateAppointmentStatus), appointmentController.updateStatus);

module.exports = router;
