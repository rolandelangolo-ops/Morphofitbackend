const env = require('./config/env');
const { connectDB } = require('./config/db');
const app = require('./app');
const { seedDemoUsers } = require('./services/demoSeedService');

async function main() {
  await connectDB();
  await seedDemoUsers();

  app.listen(env.port, () => {
    console.log(`[server] Morphofit API listening on port ${env.port} (${env.nodeEnv})`);
  });
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
