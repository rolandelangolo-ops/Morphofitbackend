const { Schema, model } = require('mongoose');

const ConversationSchema = new Schema(
  {
    // 1:1 direct conversations only — no group chat in MorphoFit today.
    participantIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: (v) => Array.isArray(v) && v.length === 2,
    },
    // Sorted `${idA}_${idB}` of participantIds — lets a unique index enforce
    // "one conversation per pair" at the DB level (see
    // messagingController.createConversation), closing a check-then-create
    // race that a plain findOne+create can't. Sparse so pre-migration
    // documents (before this field existed) don't collide on a shared null.
    pairKey: { type: String },
    lastMessageAt: { type: Date, default: undefined },
    lastMessagePreview: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

ConversationSchema.index({ participantIds: 1 });
ConversationSchema.index({ pairKey: 1 }, { unique: true, sparse: true });

function pairKeyFor(idA, idB) {
  return [idA.toString(), idB.toString()].sort().join('_');
}

module.exports = model('Conversation', ConversationSchema);
module.exports.pairKeyFor = pairKeyFor;
