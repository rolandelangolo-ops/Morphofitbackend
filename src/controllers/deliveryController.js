const { Order } = require('../models');
const { ok } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');

const orders = catchAsync(async (req, res) => {
  const items = await Order.find({ deliveryAgentId: req.user._id }).sort({ createdAt: -1 });
  return ok(res, items);
});

module.exports = { orders };
