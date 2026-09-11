const { Router } = require('express');
const adminController = require('../controllers/adminController');
const adminSupportController = require('../controllers/adminSupportController');
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { updateStatus, addResponse } = require('../validators/supportValidators');
const {
  adminCreateUser,
  adminUpdateUser,
  adminChangeRole,
  adminSetPassword,
  adminDeleteUser,
} = require('../validators/userValidators');

const router = Router();

router.use(authenticate, requireRole('admin'));

router.get('/users', adminController.users);
router.post('/users', validate(adminCreateUser), adminController.createUser);
router.get('/users/:id', adminController.getUser);
router.patch('/users/:id', validate(adminUpdateUser), adminController.updateUser);
router.patch('/users/:id/role', validate(adminChangeRole), adminController.changeRole);
router.post('/users/:id/password', validate(adminSetPassword), adminController.setPassword);
router.patch('/users/:id/deactivate', adminController.deactivateUser);
router.patch('/users/:id/reactivate', adminController.reactivateUser);
router.delete('/users/:id', validate(adminDeleteUser), adminController.deleteUser);

router.get('/orders', adminController.orders);

router.get('/activity', adminController.recentActivity);

router.get('/support', adminSupportController.list);
router.get('/support/:id', adminSupportController.getOne);
router.patch('/support/:id/status', validate(updateStatus), adminSupportController.updateStatus);
router.post('/support/:id/responses', validate(addResponse), adminSupportController.respond);

module.exports = router;
