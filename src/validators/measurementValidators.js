const { z } = require('zod');

// Generous but sane bounds (in cm) — wide enough to cover real human
// variation, tight enough to reject obviously bad input (negative values,
// unit mixups, typos like an extra digit).
const cm = (min, max) => z.number().min(min).max(max);

// [min, max] in cm per measurement. Exported so AI-estimated values are
// clamped to exactly the same limits a manual save would be rejected at.
const BOUNDS = {
  shoulder: [15, 100],
  chest: [40, 250],
  waist: [30, 250],
  hip: [40, 250],
  inseam: [20, 150],
  thigh: [15, 120],
  armLength: [20, 120],
  height: [100, 260],
};

const saveMeasurements = z.object({
  shoulder: cm(...BOUNDS.shoulder),
  chest: cm(...BOUNDS.chest),
  waist: cm(...BOUNDS.waist),
  hip: cm(...BOUNDS.hip),
  inseam: cm(...BOUNDS.inseam),
  thigh: cm(...BOUNDS.thigh),
  armLength: cm(...BOUNDS.armLength),
  height: cm(...BOUNDS.height),
  morphology: z.string().max(40).optional(),
  // Set when saving the result of a photo/live scan: the server then takes
  // method, confidence, warnings and the stored photos from that draft
  // (never from the request body), so they can't be forged by the client.
  draftId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id').optional(),
});

// Creating a draft from four uploaded photos (multipart -> all text fields
// arrive as strings, hence coerce).
const createScanDraft = z.object({
  heightCm: z.coerce.number().min(BOUNDS.height[0]).max(BOUNDS.height[1]),
  method: z.enum(['photo', 'live']),
});

module.exports = { saveMeasurements, createScanDraft, BOUNDS };
