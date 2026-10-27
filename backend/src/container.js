// Composition root: the only place that knows which concrete repositories the services use.
// [BACKEND M2.9: Project structure & layers] routes/ wire, controllers/ adapt, services/ decide,
// repositories (@seatsure/db) store; dependencies are created here and flow one way.
// [FULLSTACK M3.2: Prisma instead of in-memory CRUD] The repositories wired below persist everything
// in PostgreSQL through Prisma, so data survives restarts.
// Unit tests build the same services with in-memory fakes instead ([BACKEND M2.11: swap the storage]).
import {
  analyticsRepository,
  catalogRepository,
  eventRepository,
  mongo,
  outboxRepository,
  prisma,
  registrationRepository,
  taskRepository,
  userRepository,
  withTransaction,
} from '@seatsure/db';
import { createEventBus } from './events/eventBus.js';
import { createOutboxDispatcher } from './events/outboxDispatcher.js';
import { registerActivitySubscriber } from './events/subscribers/activitySubscriber.js';
import { registerNotificationSubscriber } from './events/subscribers/notificationSubscriber.js';
import { createAnalyticsService } from './services/analyticsService.js';
import { createEventService } from './services/eventService.js';
import { createFeedService } from './services/feedService.js';
import { createHealthService } from './services/healthService.js';
import { createRegistrationService } from './services/registrationService.js';
import { createTaskService } from './services/taskService.js';
import { logger } from './utils/logger.js';

export function createContainer({ config, mongoUri = '' }) {
  const bus = createEventBus();
  registerActivitySubscriber(bus, { store: mongo });
  registerNotificationSubscriber(bus, { store: mongo });

  const dispatcher = createOutboxDispatcher({
    outbox: outboxRepository,
    bus,
    batchSize: config.outbox.batchSize,
    intervalMs: config.outbox.intervalMs,
    deliveryTimeoutMs: config.outbox.deliveryTimeoutMs,
  });

  const shared = {
    events: eventRepository,
    registrations: registrationRepository,
    catalog: catalogRepository,
    outbox: outboxRepository,
    runInTransaction: (work) => withTransaction(work),
    afterCommit: () => dispatcher.kick(), // deliver new outbox messages promptly
  };

  const mongoControl = {
    async disconnect() {
      await mongo.disconnectMongo();
      logger.warn('MongoDB disconnected (simulated outage)');
      return mongo.mongoState();
    },
    async reconnect() {
      await mongo.connectMongo(mongoUri);
      logger.info('MongoDB reconnected');
      dispatcher.kick();
      return mongo.mongoState();
    },
  };

  return {
    config,
    bus,
    dispatcher,
    mongoControl,
    users: userRepository,
    catalog: catalogRepository,
    eventService: createEventService(shared),
    registrationService: createRegistrationService(shared),
    taskService: createTaskService({ tasks: taskRepository }),
    analyticsService: createAnalyticsService({
      analytics: analyticsRepository,
      mongoReports: mongo,
      mongoState: mongo.mongoState,
      mongoTimeoutMs: config.mongoTimeoutMs,
    }),
    feedService: createFeedService({ store: mongo, mongoState: mongo.mongoState, mongoTimeoutMs: config.mongoTimeoutMs }),
    healthService: createHealthService({
      pingPostgres: () => prisma.$queryRaw`SELECT 1`,
      mongoState: mongo.mongoState,
      outbox: outboxRepository,
      registrations: registrationRepository,
      dispatcher,
    }),
  };
}
