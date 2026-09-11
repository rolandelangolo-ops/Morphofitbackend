const { Router } = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  register,
  login,
  forgotPassword,
  resetPassword,
  verifyEmail,
} = require('../validators/authValidators');

const router = Router();

router.post('/register', validate(register), authController.register);
router.post('/login', validate(login), authController.login);
router.get('/me', authenticate, authController.me);

// Email-driven account recovery / verification. All public by necessity —
// the user can't be signed in to use them.
router.post('/forgot-password', validate(forgotPassword), authController.forgotPassword);
router.post('/reset-password', validate(resetPassword), authController.resetPassword);
router.post('/verify-email', validate(verifyEmail), authController.verifyEmail);
router.post('/resend-verification', authenticate, authController.resendVerification);

module.exports = router;
