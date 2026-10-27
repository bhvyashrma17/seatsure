// Public surface of the Advanced Database layer. The API (/backend) imports only from here.
export { prisma, createPrismaClient, type Db } from './client';
export { withTransaction, type Tx, type IsolationLevel, type TransactionOptions } from './transaction';
export { DbError, toDbError, type DbErrorKind } from './errors';
export * as eventRepository from './repositories/eventRepository';
export * as registrationRepository from './repositories/registrationRepository';
export * as userRepository from './repositories/userRepository';
export * as catalogRepository from './repositories/catalogRepository';
export * as outboxRepository from './repositories/outboxRepository';
export * as analyticsRepository from './repositories/analyticsRepository';
export * as taskRepository from './repositories/taskRepository';
export * as mongo from './mongo/index';
export { OUTBOX, eventMessage, registrationMessage, type OutboxType, type EventRef, type RegistrationMessage, type EventMessage } from './outboxMessages';
export { EventCategory, EventStatus, RegistrationStatus, Role } from '../generated/prisma/enums';
