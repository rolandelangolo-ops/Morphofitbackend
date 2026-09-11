const { Schema, model } = require('mongoose');

const AdminActionLogSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId, default: undefined },
    detail: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

// recentActivity() sorts newest-first.
AdminActionLogSchema.index({ createdAt: -1 });

module.exports = model('AdminActionLog', AdminActionLogSchema);
