const { Order, User } = require('../models');
const { ok } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { publicUser } = require('./authController');

const users = catchAsync(async (req, res) => {
  const items = await User.find().sort({ createdAt: -1 });
  return ok(res, items.map(publicUser));
});

const orders = catchAsync(async (req, res) => {
  const items = await Order.find().sort({ createdAt: -1 });
  return ok(res, items);
});

module.exports = { users, orders };
