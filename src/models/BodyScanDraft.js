const { Schema, model } = require('mongoose');
const { SCAN_VIEWS, SCAN_METHODS } = require('./Measurement');

const DRAFT_TTL_HOURS = 24;

// A draft holds photos that were uploaded but not yet saved as a scan. It
// exists so (a) an analysis retry never needs a re-upload, and (b) an
// abandoned or rejected scan never becomes the user's "latest measurement"
// that a tailor could quote from. Saving a scan (POST /client/measurements
// with `draftId`) moves the photos onto the Measurement and removes the
// draft; expired drafts (and only drafts) are swept — see
// services/bodyScanCleanup.js.
const BodyScanDraftSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    method: { type: String, enum: SCAN_METHODS, required: true },
    heightCm: { type: Number, required: true },
    photos: {
      type: [{ view: { type: String, enum: SCAN_VIEWS, required: true }, file: { type: String, required: true }, _id: false }],
      default: [],
    },
    // Last successful analysis (the validated, clamped result the client saw).
    analysis: { type: Schema.Types.Mixed, default: undefined },
    // Analyze attempts so far (successful or not) — capped per draft so a
    // retry loop can't burn API quota.
    analysisCount: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

BodyScanDraftSchema.statics.newExpiry = () => new Date(Date.now() + DRAFT_TTL_HOURS * 60 * 60 * 1000);

module.exports = model('BodyScanDraft', BodyScanDraftSchema);
module.exports.DRAFT_TTL_HOURS = DRAFT_TTL_HOURS;
