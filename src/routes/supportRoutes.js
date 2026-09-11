const { Router } = require('express');
const supportController = require('../controllers/supportController');
const { authenticate } = require('../middleware/auth');
const { uploadSupportAttachments } = require('../middleware/upload');
const validate = require('../middleware/validate');
const { createSupportRequest, addResponse } = require('../validators/supportValidators');

const router = Router();

router.use(authenticate);

router.post('/', uploadSupportAttachments, validate(createSupportRequest), supportController.create);
router.get('/', supportController.mine);
router.get('/:id', supportController.getOne);
router.post('/:id/responses', validate(addResponse), supportController.addResponse);

module.exports = router;
