-- Outbox messages get a globally unique idempotency key for MongoDB deliveries.
-- (Found by test BE-I25: after a re-seed the bigint ids restart at 1, but a persistent MongoDB still
--  remembers outboxId "1", so new notifications were dropped as duplicates.)

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "message_id" UUID NOT NULL DEFAULT gen_random_uuid();

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_message_id_key" ON "outbox_events"("message_id");

