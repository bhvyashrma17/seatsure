-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'ORGANISER');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('WORKSHOP', 'HACKATHON', 'TALK', 'COMPETITION', 'CULTURAL', 'SPORTS');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('CONFIRMED', 'WAITLISTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "email" VARCHAR(120) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "department" VARCHAR(80),
    "year_of_study" SMALLINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clubs" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_organisers" (
    "club_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(40) NOT NULL DEFAULT 'Coordinator',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_organisers_pkey" PRIMARY KEY ("club_id","user_id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "building" VARCHAR(80) NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" SERIAL NOT NULL,
    "club_id" INTEGER NOT NULL,
    "venue_id" INTEGER NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "category" "EventCategory" NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "registration_closes_at" TIMESTAMPTZ(3),
    "capacity" INTEGER NOT NULL,
    "confirmed_count" INTEGER NOT NULL DEFAULT 0,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" "RegistrationStatus" NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "promoted_at" TIMESTAMPTZ(3),
    "checked_in_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" BIGSERIAL NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_name_key" ON "clubs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_slug_key" ON "clubs"("slug");

-- CreateIndex
CREATE INDEX "club_organisers_user_id_idx" ON "club_organisers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "venues_name_key" ON "venues"("name");

-- CreateIndex
CREATE INDEX "events_club_id_starts_at_idx" ON "events"("club_id", "starts_at");

-- CreateIndex
CREATE INDEX "events_published_starts_at_idx" ON "events"("starts_at", "id") WHERE (status = 'PUBLISHED');

-- CreateIndex
CREATE INDEX "events_published_category_starts_at_idx" ON "events"("category", "starts_at", "id") WHERE (status = 'PUBLISHED');

-- CreateIndex
CREATE INDEX "registrations_event_id_status_created_at_idx" ON "registrations"("event_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "registrations_user_id_created_at_idx" ON "registrations"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "registrations_answers_gin_idx" ON "registrations" USING GIN ("answers" jsonb_path_ops);

-- CreateIndex
CREATE UNIQUE INDEX "registrations_one_active_per_user_key" ON "registrations"("event_id", "user_id") WHERE (status <> 'CANCELLED');

-- CreateIndex
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events"("available_at", "id") WHERE (published_at IS NULL);

-- AddForeignKey
ALTER TABLE "club_organisers" ADD CONSTRAINT "club_organisers_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_organisers" ADD CONSTRAINT "club_organisers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
