const { z } = require('zod');

const updateOrderStatus = z.object({
  status: z.string().min(1),
});

module.exports = { updateOrderStatus };
