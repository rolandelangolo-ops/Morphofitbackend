const { Router } = require('express');

const router = Router();

router.use('/auth', require('./authRoutes'));
router.use('/appointments', require('./appointmentRoutes'));
router.use('/client', require('./clientRoutes'));
router.use('/stylist', require('./stylistRoutes'));
router.use('/tailor', require('./tailorRoutes'));
router.use('/delivery', require('./deliveryRoutes'));
router.use('/admin', require('./adminRoutes'));

module.exports = router;
