const { Order, User } = require('../models');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { notify } = require('./notificationsController');

const orders = catchAsync(async (req, res) => {
  const items = await Order.find({
    $or: [{ deliveryAgentId: req.user._id }, { status: 'ready' }],
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('clientId', 'name city')
    .populate('tailorId', 'name city');

  // Populate clientId/tailorId (so the courier sees the real pickup/drop-off
  // names) while keeping those fields as plain id strings for existing
  // consumers — the populated data rides along in new `client`/`tailor`
  // fields instead of replacing the id shape.
  const enriched = items.map((order) => {
    const obj = order.toObject();
    return {
      ...obj,
      clientId: order.clientId?._id?.toString() ?? obj.clientId,
      tailorId: order.tailorId?._id?.toString() ?? obj.tailorId,
      client: order.clientId ? { name: order.clientId.name, city: order.clientId.city } : undefined,
      tailor: order.tailorId ? { name: order.tailorId.name, city: order.tailorId.city } : undefined,
    };
  });
  return ok(res, enriched);
});

const updateStatus = catchAsync(async (req, res) => {
  const { status, notes } = req.body;

  // A courier may only touch an order already assigned to them, or one
  // that's ready for pickup and unclaimed (about to become theirs) — never
  // another courier's in-flight delivery.
  const order = await Order.findOne({
    _id: req.params.id,
    $or: [{ deliveryAgentId: req.user._id }, { status: 'ready', deliveryAgentId: { $exists: false } }],
  });
  if (!order) throw ApiError.notFound('Order not found');

  if (status === 'assigned' && !order.deliveryAgentId) {
    order.deliveryAgentId = req.user._id;
  }

  if (status !== undefined) order.status = status;
  if (notes !== undefined) order.notes = notes;
  await order.save();

  try {
    const client = await User.findById(order.clientId);
    if (client && status) {
      await notify(
        client,
        'order_status_changed',
        'Delivery status updated',
        `${order.item} is now ${status.replace(/_/g, ' ')}.`,
        { orderId: order._id }
      );
    }

    if (order.tailorId && status) {
      const tailor = await User.findById(order.tailorId);
      if (tailor) {
        await notify(
          tailor,
          'order_status_changed',
          'Delivery update',
          `${order.item} status changed to ${status.replace(/_/g, ' ')}.`,
          { orderId: order._id }
        );
      }
    }
  } catch (err) {
    // Notifications are a side effect — never fail an otherwise-successful
    // status update because of a notification hiccup.
    console.error('[delivery] notify failed:', err);
  }

  return ok(res, order);
});

module.exports = { orders, updateStatus };
