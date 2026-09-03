const { Schema, model } = require('mongoose');

const OrderSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    stylistId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    tailorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    deliveryAgentId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    item: { type: String, required: true },
    morphology: { type: String, default: '' },
    status: { type: String, default: 'pending' },
    price: { type: Number, default: null },
    currency: { type: String, default: 'XAF' },
    fabric: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = model('Order', OrderSchema);
