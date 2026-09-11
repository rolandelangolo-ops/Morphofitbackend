const { z } = require('zod');

// Generous but sane bounds (in cm) — wide enough to cover real human
// variation, tight enough to reject obviously bad input (negative values,
// unit mixups, typos like an extra digit).
const cm = (min, max) => z.number().min(min).max(max);

const saveMeasurements = z.object({
  shoulder: cm(15, 100),
  chest: cm(40, 250),
  waist: cm(30, 250),
  hip: cm(40, 250),
  inseam: cm(20, 150),
  thigh: cm(15, 120),
  armLength: cm(20, 120),
  height: cm(100, 260),
  morphology: z.string().max(40).optional(),
});

module.exports = { saveMeasurements };
