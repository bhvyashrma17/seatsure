-- [DATABASE M1.6: DDL integrity constraints] Hand-written migration.
-- Prisma's schema language has no CHECK constraints, so business invariants that the
-- database itself must guarantee are added here. They are the last line of defence:
-- even a buggy service (or a manual psql UPDATE) cannot store an impossible state.

-- Users ------------------------------------------------------------------------------
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_format_chk"   CHECK (position('@' in email) > 1),
  ADD CONSTRAINT "users_year_of_study_chk"  CHECK (year_of_study IS NULL OR year_of_study BETWEEN 1 AND 5);

-- Venues -----------------------------------------------------------------------------
ALTER TABLE "venues"
  ADD CONSTRAINT "venues_capacity_positive_chk" CHECK (capacity > 0);

-- Events -----------------------------------------------------------------------------
ALTER TABLE "events"
  ADD CONSTRAINT "events_capacity_positive_chk" CHECK (capacity > 0),
  -- The core "can't overbook" invariant, enforced by PostgreSQL itself.
  ADD CONSTRAINT "events_confirmed_within_capacity_chk" CHECK (confirmed_count >= 0 AND confirmed_count <= capacity),
  ADD CONSTRAINT "events_time_order_chk" CHECK (ends_at > starts_at),
  ADD CONSTRAINT "events_registration_closes_before_start_chk"
    CHECK (registration_closes_at IS NULL OR registration_closes_at <= starts_at),
  ADD CONSTRAINT "events_published_at_chk" CHECK (status = 'DRAFT' OR published_at IS NOT NULL),
  -- [DATABASE M1.9] JSONB is flexible, but the top-level shape is still guaranteed.
  ADD CONSTRAINT "events_questions_is_array_chk" CHECK (jsonb_typeof(questions) = 'array');

-- Registrations ----------------------------------------------------------------------
ALTER TABLE "registrations"
  ADD CONSTRAINT "registrations_answers_is_object_chk" CHECK (jsonb_typeof(answers) = 'object'),
  -- cancelled_at is set exactly when the row is CANCELLED.
  ADD CONSTRAINT "registrations_cancelled_at_chk" CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL)),
  -- Only a confirmed attendee can be checked in.
  ADD CONSTRAINT "registrations_checkin_requires_confirmed_chk" CHECK (checked_in_at IS NULL OR status = 'CONFIRMED');

-- Outbox -----------------------------------------------------------------------------
ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_attempts_chk" CHECK (attempts >= 0);
