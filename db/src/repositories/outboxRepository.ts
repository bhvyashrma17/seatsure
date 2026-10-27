// Transactional outbox ([DATABASE M3.19: the dual-write problem]).
// A registration change and the "tell MongoDB about it" message are written in ONE PostgreSQL
// transaction. A dispatcher later delivers pending messages to MongoDB and marks them published,
// retrying on failure. So MongoDB can lag behind, but it can never miss or invent an event.
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../client';
import type { Tx } from '../transaction';

export type OutboxMessage = { id: bigint; messageId: string; type: string; payload: Prisma.JsonValue; attempts: number };

export async function add(tx: Tx, type: string, payload: Prisma.InputJsonValue) {
  return tx.outboxEvent.create({ data: { type, payload }, select: { id: true } });
}

/** Oldest pending messages that are due (uses the partial index outbox_events_pending_idx). */
export async function fetchDue(limit: number, now: Date = new Date(), client: Tx = prisma): Promise<OutboxMessage[]> {
  return client.outboxEvent.findMany({
    where: { publishedAt: null, availableAt: { lte: now } },
    orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
    take: limit,
    select: { id: true, messageId: true, type: true, payload: true, attempts: true },
  });
}

export async function markPublished(id: bigint, at: Date = new Date(), client: Tx = prisma) {
  await client.outboxEvent.update({ where: { id }, data: { publishedAt: at, lastError: null } });
}

/** Records a failed delivery and schedules the next attempt (the caller computes the backoff). */
export async function markFailed(id: bigint, error: string, nextAttemptAt: Date, client: Tx = prisma) {
  await client.outboxEvent.update({
    where: { id },
    data: { attempts: { increment: 1 }, lastError: error.slice(0, 500), availableAt: nextAttemptAt },
  });
}

/** Re-queue everything (used to rebuild a fresh/in-memory MongoDB from PostgreSQL, the source of truth). */
export async function requeueAll(client: Tx = prisma) {
  const { count } = await client.outboxEvent.updateMany({ data: { publishedAt: null, availableAt: new Date(), attempts: 0, lastError: null } });
  return count;
}

export async function stats(client: Tx = prisma) {
  const [pending, failing, published] = await Promise.all([
    client.outboxEvent.count({ where: { publishedAt: null } }),
    client.outboxEvent.count({ where: { publishedAt: null, attempts: { gt: 0 } } }),
    client.outboxEvent.count({ where: { publishedAt: { not: null } } }),
  ]);
  return { pending, failing, published };
}
