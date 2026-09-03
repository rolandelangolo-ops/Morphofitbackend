const { Measurement, Order } = require('../models');
const { ok } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');

const measurements = catchAsync(async (req, res) => {
  const latest = await Measurement.findOne({ userId: req.user._id }).sort({ scannedAt: -1 });
  return ok(res, latest);
});

const orders = catchAsync(async (req, res) => {
  const items = await Order.find({ clientId: req.user._id }).sort({ createdAt: -1 });
  return ok(res, items);
});

module.exports = { measurements, orders };
