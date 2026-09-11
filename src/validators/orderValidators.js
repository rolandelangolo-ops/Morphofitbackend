const { z } = require('zod');
const { ORDER_STATUSES } = require('../models/Order');
const { objectId } = require('./common');

const statusEnum = z.enum(ORDER_STATUSES);

const updateOrderStatus = z.object({
  status: statusEnum.optional(),
  price: z.number().positive().optional(),
  notes: z.string().max(2000).optional(),
});

const createOrder = z.object({
  tailorId: objectId.optional(),
  item: z.string().min(1).max(200).optional(),
  morphology: z.string().max(60).optional(),
  fabric: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  price: z.number().positive().optional(),
  currency: z.string().max(10).optional(),
});

// Clients may only ever move their own order to a subset of the full
// lifecycle (accepting a quote / paying escrow) or edit its specs while it's
// still being negotiated — tailor/delivery-only stages (production, ready,
// assigned, out, delivered) are set by their respective controllers.
const clientUpdateOrder = z.object({
  status: z.enum(['confirmed', 'production']).optional(),
  price: z.number().positive().optional(),
  notes: z.string().max(2000).optional(),
  fabric: z.string().max(200).optional(),
});

module.exports = { statusEnum, updateOrderStatus, createOrder, clientUpdateOrder };
