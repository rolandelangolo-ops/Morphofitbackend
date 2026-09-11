const { Router } = require('express');
const messagingController = require('../controllers/messagingController');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { uploadMessageAttachment } = require('../middleware/upload');
const { createConversation, sendMessage, reactToMessage } = require('../validators/messagingValidators');

const router = Router();

router.use(authenticate);

router.get('/conversations', messagingController.listConversations);
router.post('/conversations', validate(createConversation), messagingController.createConversation);
router.get('/conversations/:id/messages', messagingController.listMessages);
router.post('/conversations/:id/messages', uploadMessageAttachment, validate(sendMessage), messagingController.sendMessage);
router.patch('/conversations/:id/read', messagingController.markRead);
router.post('/conversations/:id/messages/:messageId/reactions', validate(reactToMessage), messagingController.react);
router.delete('/conversations/:id/messages/:messageId', messagingController.deleteMessage);

module.exports = router;
