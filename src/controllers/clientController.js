const { BodyScanDraft, Measurement, Order, User } = require('../models');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { notify } = require('./notificationsController');
const { appendNegotiationEntry } = require('../utils/negotiation');
const { publicScan } = require('./bodyScanController');

const measurements = catchAsync(async (req, res) => {
  const latest = await Measurement.findOne({ userId: req.user._id }).sort({ scannedAt: -1 });
  return ok(res, latest);
});

const saveMeasurements = catchAsync(async (req, res) => {
  const { shoulder, chest, waist, hip, inseam, thigh, armLength, height, morphology, draftId } = req.body;
  const doc = {
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
  };

  // Saving the result of a photo/live scan: method, confidence, warnings and
  // the stored photos come from the server-side draft, never the request.
  // The draft is claimed atomically so a double-submit can't attach the same
  // photos to two scans (which would make deleting one scan's photos break
  // the other).
  let draft = null;
  if (draftId) {
    draft = await BodyScanDraft.findOneAndDelete({
      _id: draftId,
      userId: req.user._id,
      expiresAt: { $gt: new Date() },
      analysis: { $exists: true },
    });
    if (!draft) throw ApiError.notFound('This scan has expired or was not analysed yet. Please run the analysis again.');
    doc.method = draft.method;
    doc.confidence = draft.analysis.overallConfidence;
    doc.warnings = draft.analysis.warnings;
    doc.photos = draft.photos;
    if (!doc.morphology) doc.morphology = draft.analysis.morphology;
  }

  let measurement;
  try {
    measurement = await Measurement.create(doc);
  } catch (err) {
    // Put the draft back so the user can retry the save (and its photos
    // aren't orphaned without an owner document).
    if (draft) await BodyScanDraft.create(draft.toObject()).catch(() => {});
    throw err;
  }

  if (measurement.morphology) {
    await User.findByIdAndUpdate(req.user._id, { morphology: measurement.morphology });
  }

  return ok(res, publicScan(req, measurement));
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
