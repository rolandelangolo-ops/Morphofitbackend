const { Order, User } = require('../models');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { notify } = require('./notificationsController');
const { appendNegotiationEntry } = require('../utils/negotiation');

const orders = catchAsync(async (req, res) => {
  const items = await Order.find({ tailorId: req.user._id }).sort({ createdAt: -1 });
  return ok(res, items);
});

const updateStatus = catchAsync(async (req, res) => {
  const { status, price, notes } = req.body;

  // Admins may update any order; tailors only their own.
  const filter = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, tailorId: req.user._id };
  const order = await Order.findOne(filter);
  if (!order) throw ApiError.notFound('Order not found');

  if (status !== undefined) order.status = status;
  if (price !== undefined) order.price = price;
  if (notes !== undefined) order.notes = notes;

  if (price !== undefined || status === 'confirmed') {
    appendNegotiationEntry(order, {
      author: req.user,
      amount: order.price,
      notes: notes || '',
      becameConfirmed: status === 'confirmed',
    });
  }

  await order.save();

  try {
    const client = await User.findById(order.clientId);
    if (client) {
      await notify(
        client,
        'order_status_changed',
        'Order update from Tailor',
        status
          ? `${order.item} is now ${status.replace(/_/g, ' ')}.`
          : `Tailor revised quote to ${order.currency} ${order.price?.toLocaleString()}.`,
        { orderId: order._id }
      );
    }

    // If marked ready, notify delivery couriers
    if (status === 'ready') {
      const couriers = await User.find({ role: 'delivery_agent', active: true });
      for (const courier of couriers) {
        await notify(
          courier,
          'order_status_changed',
          'New Delivery Ready for Pickup',
          `${order.item} is ready at atelier for courier dispatch.`,
          { orderId: order._id }
        );
      }
    }
  } catch (err) {
    console.error('[tailor] notify failed:', err);
  }

  return ok(res, order);
});

module.exports = { orders, updateStatus };
