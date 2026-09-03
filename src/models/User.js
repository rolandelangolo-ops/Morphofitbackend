const { Schema, model } = require('mongoose');

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['client', 'stylist', 'tailor', 'delivery_agent', 'admin'],
      default: 'client',
    },
    morphology: { type: String, default: undefined },
    city: { type: String, default: undefined },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

module.exports = model('User', UserSchema);
