// Process entry point: connect to the databases, start the outbox dispatcher, then listen.
// [BACKEND M1.9] app.listen() is what turns the script into a long-running server.
// [BACKEND M1.2-1.4: Client-server, HTTP, request-response lifecycle] The React client (another origin)
// sends HTTP requests to this process's port; each one runs through app.js and ends as one response.
// [BACKEND M1.7: Node.js & npm] Started by the npm scripts "dev" (nodemon) and "start" (tsx).
import { mongo, outboxRepository, prisma } from '@seatsure/db';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { createContainer } from './container.js';
import { logger } from './utils/logger.js';

async function startMongo() {
  let uri = config.mongoUri;
  let memoryServer = null;
  if (!uri && !config.isProduction) {
    // Dev fallback: an npm-distributed MongoDB binary, so the project runs without installing MongoDB.
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri('seatsure');
    logger.warn('MONGODB_URI is empty: using an in-memory MongoDB. Its data is rebuilt from PostgreSQL on every start.');
  }
  try {
    await mongo.connectMongo(uri);
    logger.info('MongoDB connected');
  } catch (err) {
    // [BACKEND M3.11: Graceful degradation] Start anyway: PostgreSQL features work; the outbox
    // keeps MongoDB-bound messages until it comes back.
    logger.error('MongoDB unavailable; starting in degraded mode', { error: err.message });
  }
  return { uri, memoryServer };
}

async function main() {
  await prisma.$queryRaw`SELECT 1`; // fail fast if PostgreSQL is not reachable
  logger.info('PostgreSQL connected');

  const { uri, memoryServer } = await startMongo();
  const container = createContainer({ config, mongoUri: uri });

  if (memoryServer) {
    const requeued = await outboxRepository.requeueAll();
    logger.info(`Replaying ${requeued} outbox messages into MongoDB`);
  }
  container.dispatcher.start();
  container.dispatcher
    .drain()
    .then((n) => n && logger.info(`Outbox drained (${n} messages)`))
    .catch((err) => logger.error('Initial outbox drain failed', { error: err.message }));

  const app = createApp(container);
  const server = app.listen(config.port, () => {
    logger.info(`SeatSure API listening on http://localhost:${config.port}/api/v1 (${config.env})`);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down`);
    server.close();
    await container.dispatcher.stop();
    await mongo.disconnectMongo().catch(() => {});
    await prisma.$disconnect();
    await memoryServer?.stop();
    process.exit(0);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Failed to start', { error: err.message });
  process.exit(1);
});
