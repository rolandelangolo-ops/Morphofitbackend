const { Order } = require('../models');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');

const orders = catchAsync(async (req, res) => {
  const items = await Order.find({ tailorId: req.user._id }).sort({ createdAt: -1 });
  return ok(res, items);
});

const updateStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  // Admins may update any order; tailors only their own.
  const filter = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, tailorId: req.user._id };
  const order = await Order.findOneAndUpdate(filter, { status }, { new: true });
  if (!order) throw ApiError.notFound('Order not found');
  return ok(res, order);
});

module.exports = { orders, updateStatus };
