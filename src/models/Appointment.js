const { Schema, model } = require('mongoose');

const AppointmentSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tailorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    notes: { type: String, default: '' },
    status: {
      type: String,
      enum: ['requested', 'confirmed', 'declined', 'completed'],
      default: 'requested',
    },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

module.exports = model('Appointment', AppointmentSchema);
