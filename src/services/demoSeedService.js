const bcrypt = require('bcryptjs');
const { User } = require('../models');

const DEMO_USERS = [
  ['Client Demo', 'client@morphofit.com', 'client'],
  ['Stylist Demo', 'stylist@morphofit.com', 'stylist'],
  ['Tailor Demo', 'tailor@morphofit.com', 'tailor'],
  ['Delivery Demo', 'delivery@morphofit.com', 'delivery_agent'],
  ['Admin Demo', 'admin@morphofit.com', 'admin'],
];

/** Idempotent — safe to call on every server start (see server.js). */
async function seedDemoUsers() {
  for (const [name, email, role] of DEMO_USERS) {
    if (await User.findOne({ email })) continue;
    await User.create({ name, email, role, passwordHash: await bcrypt.hash('password123', 10) });
  }
}

module.exports = { seedDemoUsers, DEMO_USERS };
