const { Schema, model } = require('mongoose');

const SCAN_VIEWS = ['front', 'back', 'left', 'right'];
const SCAN_METHODS = ['photo', 'live'];

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

  // ── Added with the photo / live AI body scan. All optional so every scan
  // saved before this existed stays valid untouched: a missing `method` means
  // "the earlier height-based estimate", not an error.
  method: { type: String, enum: SCAN_METHODS, default: undefined },
  confidence: { type: Number, min: 0, max: 1, default: undefined },
  warnings: { type: [String], default: undefined },
  // Stored private images (uploads/bodyscans/<file>), owner-only. When the user
  // removes a scan's photos this array is emptied and the files deleted — the
  // measurements themselves are kept.
  photos: {
    type: [{ view: { type: String, enum: SCAN_VIEWS, required: true }, file: { type: String, required: true }, _id: false }],
    default: undefined,
  },
});

// Every "latest measurement for user" query filters by userId and sorts by
// scannedAt — a compound index lets that be an index scan instead of a
// collection scan.
MeasurementSchema.index({ userId: 1, scannedAt: -1 });

// Body images are private to the owner. Anything that serialises a
// Measurement generically (res.json(doc), exports, other roles' views) must
// not carry the stored filenames; the owner-only history endpoint builds its
// photo URLs explicitly (controllers/bodyScanController.js publicScan).
MeasurementSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.photos;
    return ret;
  },
});

module.exports = model('Measurement', MeasurementSchema);
module.exports.SCAN_VIEWS = SCAN_VIEWS;
module.exports.SCAN_METHODS = SCAN_METHODS;
