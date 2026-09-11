const { Schema, model } = require('mongoose');

const MeasurementSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shoulder: { type: Number, required: true },
  chest: { type: Number, required: true },
  waist: { type: Number, required: true },
  hip: { type: Number, required: true },
  inseam: { type: Number, required: true },
  thigh: { type: Number, required: true },
  armLength: { type: Number, required: true },
  height: { type: Number, required: true },
  morphology: { type: String, required: true },
  scannedAt: { type: Date, default: Date.now },
});

// Every "latest measurement for user" query filters by userId and sorts by
// scannedAt — a compound index lets that be an index scan instead of a
// collection scan.
MeasurementSchema.index({ userId: 1, scannedAt: -1 });

module.exports = model('Measurement', MeasurementSchema);
