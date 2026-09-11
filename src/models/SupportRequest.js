const { Schema, model } = require('mongoose');

const TYPES = ['bug', 'feedback', 'question'];
const CATEGORIES = [
  'account',
  'orders',
  'appointments',
  'payments',
  'messaging',
  'measurements',
  'visualizer',
  'app_bug',
  'feature_request',
  'other',
];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high'];

const ResponseSchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorRole: { type: String, required: true },
    message: { type: String, required: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, _id: true }
);

const SupportRequestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: TYPES, required: true },
    category: { type: String, enum: CATEGORIES, default: 'other' },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true },
    status: { type: String, enum: STATUSES, default: 'open', index: true },
    priority: { type: String, enum: PRIORITIES, default: 'normal' },
    context: {
      path: { type: String, default: undefined },
      screenLabel: { type: String, default: undefined },
    },
    attachments: { type: [String], default: [] },
    responses: { type: [ResponseSchema], default: [] },
  },
  { timestamps: true }
);

// mine()/list() both sort by most-recently-updated; admin filters by status.
SupportRequestSchema.index({ userId: 1, createdAt: -1 });
SupportRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = model('SupportRequest', SupportRequestSchema);
module.exports.TYPES = TYPES;
module.exports.CATEGORIES = CATEGORIES;
module.exports.STATUSES = STATUSES;
module.exports.PRIORITIES = PRIORITIES;
