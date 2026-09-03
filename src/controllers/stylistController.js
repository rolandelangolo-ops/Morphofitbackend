const { Order, User } = require('../models');
const { ok } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { publicUser } = require('./authController');

const orders = catchAsync(async (req, res) => {
  const items = await Order.find({ stylistId: req.user._id }).sort({ createdAt: -1 });
  return ok(res, items);
});

const clients = catchAsync(async (req, res) => {
  const users = await User.find({ role: 'client' });
  return ok(res, users.map(publicUser));
});

module.exports = { orders, clients };
