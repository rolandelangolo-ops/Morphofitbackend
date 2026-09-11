const { Schema, model } = require('mongoose');

// Mirrors the frontend's STATUS_STEPS (src/pages/dashboard/Orders.tsx) —
// keep the two in sync.
const ORDER_STATUSES = [
  'pending',
  'negotiating',
  'confirmed',
  'production',
  'ready',
  'assigned',
  'out',
  'delivered',
];

const NEGOTIATION_ENTRY_TYPES = ['quote', 'counter', 'acceptance'];

// A structured, shared negotiation trail — both parties read the exact same
// entries (unlike a per-browser-tab local log), and each price/notes change
// while a deal is being struck appends one entry here. `authorName` is
// snapshotted at write time so the trail renders without an extra populate.
const NegotiationEntrySchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorRole: { type: String, required: true },
    authorName: { type: String, required: true },
    amount: { type: Number, required: true },
    notes: { type: String, default: '' },
    type: { type: String, enum: NEGOTIATION_ENTRY_TYPES, required: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false }, _id: true }
);

const OrderSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    stylistId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    tailorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    deliveryAgentId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    item: { type: String, required: true },
    morphology: { type: String, default: '' },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    price: { type: Number, default: null },
    currency: { type: String, default: 'XAF' },
    fabric: { type: String, default: '' },
    notes: { type: String, default: '' },
    negotiationHistory: { type: [NegotiationEntrySchema], default: [] },
  },
  { timestamps: true }
);

module.exports = model('Order', OrderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.NEGOTIATION_ENTRY_TYPES = NEGOTIATION_ENTRY_TYPES;
