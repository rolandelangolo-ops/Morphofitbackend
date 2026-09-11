const { Measurement, Order, User } = require('../models');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { notify } = require('./notificationsController');
const { appendNegotiationEntry } = require('../utils/negotiation');

const measurements = catchAsync(async (req, res) => {
  const latest = await Measurement.findOne({ userId: req.user._id }).sort({ scannedAt: -1 });
  return ok(res, latest);
});

const saveMeasurements = catchAsync(async (req, res) => {
  const { shoulder, chest, waist, hip, inseam, thigh, armLength, height, morphology } = req.body;
  const measurement = await Measurement.create({
    userId: req.user._id,
    shoulder,
    chest,
    waist,
    hip,
    inseam,
    thigh,
    armLength,
    height,
    morphology,
    scannedAt: new Date(),
  });

  if (morphology) {
    await User.findByIdAndUpdate(req.user._id, { morphology });
  }

  return ok(res, measurement);
});

const orders = catchAsync(async (req, res) => {
  const items = await Order.find({ clientId: req.user._id })
    .sort({ createdAt: -1 })
    .populate('tailorId', 'name city')
    .populate('deliveryAgentId', 'name city');

  // Same additive shape as deliveryController.orders: ids stay plain strings
  // for existing consumers, with the populated people alongside so the
  // order-tracking card can name the real tailor/courier instead of a
  // hardcoded placeholder.
  const enriched = items.map((order) => {
    const obj = order.toObject();
    return {
      ...obj,
      tailorId: order.tailorId?._id?.toString() ?? obj.tailorId,
      deliveryAgentId: order.deliveryAgentId?._id?.toString() ?? obj.deliveryAgentId,
      tailor: order.tailorId ? { name: order.tailorId.name, city: order.tailorId.city } : undefined,
      deliveryAgent: order.deliveryAgentId
        ? { name: order.deliveryAgentId.name, city: order.deliveryAgentId.city }
        : undefined,
    };
  });
  return ok(res, enriched);
});

const createOrder = catchAsync(async (req, res) => {
  const { tailorId, item, morphology, fabric, notes, price, currency } = req.body;
  const order = await Order.create({
    clientId: req.user._id,
    tailorId: tailorId || null,
    item: item || 'Bespoke Garment',
    morphology: morphology || '',
    fabric: fabric || '',
    notes: notes || '',
    price: price || null,
    currency: currency || 'XAF',
    status: 'negotiating',
  });

  if (price) {
    appendNegotiationEntry(order, { author: req.user, amount: price, notes: notes || '' });
    await order.save();
  }

  try {
    if (tailorId) {
      const tailor = await User.findById(tailorId);
      if (tailor) {
        await notify(
          tailor,
          'order_status_changed',
          'New Bespoke Order Request',
          `${req.user.name} started a bespoke order for ${order.item}.`,
          { orderId: order._id }
        );
      }
    }
  } catch (err) {
    console.error('[client] notify failed:', err);
  }

  return ok(res, order);
});

const updateOrder = catchAsync(async (req, res) => {
  const { status, price, notes, fabric } = req.body;
  const order = await Order.findOne({ _id: req.params.id, clientId: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');

  if (status !== undefined) order.status = status;
  if (price !== undefined) order.price = price;
  if (notes !== undefined) order.notes = notes;
  if (fabric !== undefined) order.fabric = fabric;

  // A negotiation-relevant change is either a new price (a counter-offer) or
  // a transition into 'confirmed' (accepting whatever price now stands) —
  // appendNegotiationEntry infers which from `becameConfirmed`.
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
    if (order.tailorId) {
      const tailor = await User.findById(order.tailorId);
      if (tailor) {
        await notify(
          tailor,
          'order_status_changed',
          'Client Order Update',
          status === 'confirmed'
            ? `${req.user.name} accepted your quote (${order.currency} ${order.price?.toLocaleString()}).`
            : status === 'production'
            ? `${req.user.name} paid escrow for ${order.item}. Production can commence.`
            : `${req.user.name} updated the order specifications.`,
          { orderId: order._id }
        );
      }
    }
  } catch (err) {
    console.error('[client] notify failed:', err);
  }

  return ok(res, order);
});

module.exports = { measurements, saveMeasurements, orders, createOrder, updateOrder };
