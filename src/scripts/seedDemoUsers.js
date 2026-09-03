const { connectDB } = require('../config/db');
const { seedDemoUsers } = require('../services/demoSeedService');
const mongoose = require('mongoose');

connectDB()
  .then(seedDemoUsers)
  .then(() => {
    console.log('[seed] demo users ready (password: password123)');
    return mongoose.disconnect();
  })
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
