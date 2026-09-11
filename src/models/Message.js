const { Schema, model } = require('mongoose');

const MessageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['text', 'image', 'voice'], default: 'text' },
    text: { type: String, default: '' },
    attachmentUrl: { type: String, default: undefined },
    attachmentDurationSec: { type: Number, default: undefined },
    reactions: {
      type: [{ userId: { type: Schema.Types.ObjectId, ref: 'User' }, emoji: String }],
      default: [],
    },
    readBy: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    deletedAt: { type: Date, default: undefined },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

// listMessages filters by conversationId and sorts by createdAt.
MessageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = model('Message', MessageSchema);
