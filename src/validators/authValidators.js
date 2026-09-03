const { z } = require('zod');

const register = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['client', 'stylist', 'tailor', 'delivery_agent']).default('client'),
});

const login = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

module.exports = { register, login };
