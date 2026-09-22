const http = require('http');
const env = require('./config/env');
const { connectDB } = require('./config/db');
const app = require('./app');
const { seedDemoUsers, backfillUserDefaults, backfillConversationPairKeys } = require('./services/demoSeedService');
const { initSockets } = require('./sockets');
const { startBodyScanCleanup } = require('./services/bodyScanCleanup');

async function main() {
  await connectDB();
  await seedDemoUsers();
  await backfillUserDefaults();
  await backfillConversationPairKeys();
  startBodyScanCleanup();

  const httpServer = http.createServer(app);
  initSockets(httpServer, env.clientOrigins);

  httpServer.listen(env.port, () => {
    console.log(`[server] Morphofit API listening on port ${env.port} (${env.nodeEnv})`);
  });
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
