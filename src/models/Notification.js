const { Schema, model } = require('mongoose');

const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'appointment_requested',
        'appointment_confirmed',
        'appointment_declined',
        'order_status_changed',
        'message_received',
        'support_request_created',
        'support_reply_received',
        'support_response_added',
        'support_status_changed',
        'account_updated_by_admin',
        'role_changed_by_admin',
        'account_deactivated_by_admin',
        'account_reactivated_by_admin',
        'password_reset_by_admin',
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    data: {
      appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', default: undefined },
      orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: undefined },
      conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', default: undefined },
      supportRequestId: { type: Schema.Types.ObjectId, ref: 'SupportRequest', default: undefined },
    },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

// list() sorts by createdAt within a user; unreadCount()/markAllRead() filter
// by (userId, read).
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, read: 1 });

module.exports = model('Notification', NotificationSchema);
