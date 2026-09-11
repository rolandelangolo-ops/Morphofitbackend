const { Schema, model } = require('mongoose');

const USER_ROLES = ['client', 'stylist', 'tailor', 'delivery_agent', 'admin'];

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: USER_ROLES,
      default: 'client',
      index: true,
    },
    morphology: { type: String, default: undefined },
    city: { type: String, default: undefined },
    avatarUrl: { type: String, default: undefined },
    bio: { type: String, default: '' },
    phone: { type: String, default: undefined },
    active: { type: Boolean, default: true },
    notificationPrefs: {
      appointments: { type: Boolean, default: true },
      orders: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      support: { type: Boolean, default: true },
    },
    // Parallel to notificationPrefs rather than nested inside it: the two
    // channels are independently useful (keep in-app badges but stop the
    // inbox noise), and a parallel object avoids reshaping a field the
    // Settings screen already reads. `messages` defaults off — an email
    // per chat message is spam; see notificationsController's throttle.
    emailPrefs: {
      account: { type: Boolean, default: true }, // security mail — see canEmail()
      appointments: { type: Boolean, default: true },
      orders: { type: Boolean, default: true },
      messages: { type: Boolean, default: false },
      support: { type: Boolean, default: true },
    },
    emailVerified: { type: Boolean, default: false },
    // Tokens are stored as SHA-256 hashes, never in the clear — a leaked
    // database dump then can't be used to take over accounts.
    emailVerificationTokenHash: { type: String, default: undefined, select: false },
    emailVerificationExpires: { type: Date, default: undefined, select: false },
    passwordResetTokenHash: { type: String, default: undefined, select: false },
    passwordResetExpires: { type: Date, default: undefined, select: false },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

module.exports = model('User', UserSchema);
module.exports.USER_ROLES = USER_ROLES;
