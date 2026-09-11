const { Order, User, Measurement } = require('../models');
const { ok } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { publicUser } = require('./authController');

const orders = catchAsync(async (req, res) => {
  const items = await Order.find({ stylistId: req.user._id }).sort({ createdAt: -1 });
  return ok(res, items);
});

const clients = catchAsync(async (req, res) => {
  const users = await User.find({ role: 'client', active: true }).sort({ createdAt: -1 }).limit(200);

  // One query for every client's latest measurement instead of N sequential
  // findOnes: sort so the first document per userId (via the compound
  // {userId,scannedAt} index) is the most recent, then keep only that first
  // occurrence per user.
  const measurements = await Measurement.find({ userId: { $in: users.map((u) => u._id) } }).sort({
    userId: 1,
    scannedAt: -1,
  });
  const latestByUserId = new Map();
  for (const m of measurements) {
    const key = m.userId.toString();
    if (!latestByUserId.has(key)) latestByUserId.set(key, m);
  }

  const enriched = users.map((user) => {
    const latest = latestByUserId.get(user._id.toString());
    return {
      ...publicUser(user),
      measurements: latest
        ? {
            height: latest.height,
            shoulder: latest.shoulder,
            chest: latest.chest,
            waist: latest.waist,
            hip: latest.hip,
            inseam: latest.inseam,
            thigh: latest.thigh,
            armLength: latest.armLength,
            morphology: latest.morphology,
            scannedAt: latest.scannedAt,
          }
        : null,
    };
  });
  return ok(res, enriched);
});

module.exports = { orders, clients };
