const { z } = require('zod');
const { objectId } = require('./common');

const createConversation = z.object({
  userId: objectId,
});

const sendMessage = z.object({
  text: z.string().max(4000).optional(),
  durationSec: z.coerce.number().positive().optional(),
});

const reactToMessage = z.object({
  emoji: z.string().min(1).max(8),
});

module.exports = { createConversation, sendMessage, reactToMessage };
