const { Router } = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { register, login } = require('../validators/authValidators');

const router = Router();

router.post('/register', validate(register), authController.register);
router.post('/login', validate(login), authController.login);
router.get('/me', authenticate, authController.me);

module.exports = router;
