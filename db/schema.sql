-- SeatSure PostgreSQL schema (tables, enums, keys, CHECK constraints, partial/composite/GIN indexes).
-- Generated on 27 Oct 2026 from the applied Prisma migrations with:
--   pg_dump --schema-only --no-owner --no-privileges --exclude-table=_prisma_migrations seatsure_dev
-- The source of truth is db/prisma/schema.prisma + db/prisma/migrations/. The usual way to build the
-- database is `npm run setup` (create, migrate, seed). To use this file instead:
--   createdb seatsure_dev && psql -d seatsure_dev -f db/schema.sql && npm run db:seed
-- (pg_dump's \restrict / \unrestrict lines were removed so older psql versions can run the file.)

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.4 (Homebrew)
-- Dumped by pg_dump version 18.4 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: EventCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventCategory" AS ENUM (
    'WORKSHOP',
    'HACKATHON',
    'TALK',
    'COMPETITION',
    'CULTURAL',
    'SPORTS'
);


--
-- Name: EventStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EventStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'CANCELLED'
);


--
-- Name: RegistrationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RegistrationStatus" AS ENUM (
    'CONFIRMED',
    'WAITLISTED',
    'CANCELLED'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'STUDENT',
    'ORGANISER'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: club_organisers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.club_organisers (
    club_id integer NOT NULL,
    user_id integer NOT NULL,
    title character varying(40) DEFAULT 'Coordinator'::character varying NOT NULL,
    joined_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: clubs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clubs (
    id integer NOT NULL,
    name character varying(80) NOT NULL,
    slug character varying(80) NOT NULL,
    description text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: clubs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clubs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clubs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clubs_id_seq OWNED BY public.clubs.id;


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id integer NOT NULL,
    club_id integer NOT NULL,
    venue_id integer NOT NULL,
    created_by_id integer NOT NULL,
    title character varying(120) NOT NULL,
    description text NOT NULL,
    category public."EventCategory" NOT NULL,
    status public."EventStatus" DEFAULT 'DRAFT'::public."EventStatus" NOT NULL,
    starts_at timestamp(3) with time zone NOT NULL,
    ends_at timestamp(3) with time zone NOT NULL,
    registration_closes_at timestamp(3) with time zone,
    capacity integer NOT NULL,
    confirmed_count integer DEFAULT 0 NOT NULL,
    questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    published_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone NOT NULL,
    CONSTRAINT events_capacity_positive_chk CHECK ((capacity > 0)),
    CONSTRAINT events_confirmed_within_capacity_chk CHECK (((confirmed_count >= 0) AND (confirmed_count <= capacity))),
    CONSTRAINT events_published_at_chk CHECK (((status = 'DRAFT'::public."EventStatus") OR (published_at IS NOT NULL))),
    CONSTRAINT events_questions_is_array_chk CHECK ((jsonb_typeof(questions) = 'array'::text)),
    CONSTRAINT events_registration_closes_before_start_chk CHECK (((registration_closes_at IS NULL) OR (registration_closes_at <= starts_at))),
    CONSTRAINT events_time_order_chk CHECK ((ends_at > starts_at))
);


--
-- Name: events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.events_id_seq OWNED BY public.events.id;


--
-- Name: outbox_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox_events (
    id bigint NOT NULL,
    type character varying(60) NOT NULL,
    payload jsonb NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    available_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    published_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    message_id uuid DEFAULT gen_random_uuid() NOT NULL,
    CONSTRAINT outbox_events_attempts_chk CHECK ((attempts >= 0))
);


--
-- Name: outbox_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.outbox_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: outbox_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.outbox_events_id_seq OWNED BY public.outbox_events.id;


--
-- Name: registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registrations (
    id integer NOT NULL,
    event_id integer NOT NULL,
    user_id integer NOT NULL,
    status public."RegistrationStatus" NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    promoted_at timestamp(3) with time zone,
    checked_in_at timestamp(3) with time zone,
    cancelled_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone NOT NULL,
    CONSTRAINT registrations_answers_is_object_chk CHECK ((jsonb_typeof(answers) = 'object'::text)),
    CONSTRAINT registrations_cancelled_at_chk CHECK (((status = 'CANCELLED'::public."RegistrationStatus") = (cancelled_at IS NOT NULL))),
    CONSTRAINT registrations_checkin_requires_confirmed_chk CHECK (((checked_in_at IS NULL) OR (status = 'CONFIRMED'::public."RegistrationStatus")))
);


--
-- Name: registrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.registrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: registrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.registrations_id_seq OWNED BY public.registrations.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name character varying(80) NOT NULL,
    email character varying(120) NOT NULL,
    role public."Role" DEFAULT 'STUDENT'::public."Role" NOT NULL,
    department character varying(80),
    year_of_study smallint,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT users_email_format_chk CHECK ((POSITION(('@'::text) IN (email)) > 1)),
    CONSTRAINT users_year_of_study_chk CHECK (((year_of_study IS NULL) OR ((year_of_study >= 1) AND (year_of_study <= 5))))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: venues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venues (
    id integer NOT NULL,
    name character varying(80) NOT NULL,
    building character varying(80) NOT NULL,
    capacity integer NOT NULL,
    CONSTRAINT venues_capacity_positive_chk CHECK ((capacity > 0))
);


--
-- Name: venues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.venues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: venues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.venues_id_seq OWNED BY public.venues.id;


--
-- Name: clubs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clubs ALTER COLUMN id SET DEFAULT nextval('public.clubs_id_seq'::regclass);


--
-- Name: events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events ALTER COLUMN id SET DEFAULT nextval('public.events_id_seq'::regclass);


--
-- Name: outbox_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_events ALTER COLUMN id SET DEFAULT nextval('public.outbox_events_id_seq'::regclass);


--
-- Name: registrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations ALTER COLUMN id SET DEFAULT nextval('public.registrations_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: venues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues ALTER COLUMN id SET DEFAULT nextval('public.venues_id_seq'::regclass);


--
-- Name: club_organisers club_organisers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_organisers
    ADD CONSTRAINT club_organisers_pkey PRIMARY KEY (club_id, user_id);


--
-- Name: clubs clubs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: outbox_events outbox_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);


--
-- Name: registrations registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_pkey PRIMARY KEY (id);


--
-- Name: club_organisers_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX club_organisers_user_id_idx ON public.club_organisers USING btree (user_id);


--
-- Name: clubs_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clubs_name_key ON public.clubs USING btree (name);


--
-- Name: clubs_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clubs_slug_key ON public.clubs USING btree (slug);


--
-- Name: events_club_id_starts_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_club_id_starts_at_idx ON public.events USING btree (club_id, starts_at);


--
-- Name: events_published_category_starts_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_published_category_starts_at_idx ON public.events USING btree (category, starts_at, id) WHERE (status = 'PUBLISHED'::public."EventStatus");


--
-- Name: events_published_starts_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_published_starts_at_idx ON public.events USING btree (starts_at, id) WHERE (status = 'PUBLISHED'::public."EventStatus");


--
-- Name: outbox_events_message_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX outbox_events_message_id_key ON public.outbox_events USING btree (message_id);


--
-- Name: outbox_events_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbox_events_pending_idx ON public.outbox_events USING btree (available_at, id) WHERE (published_at IS NULL);


--
-- Name: registrations_answers_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registrations_answers_gin_idx ON public.registrations USING gin (answers jsonb_path_ops);


--
-- Name: registrations_event_id_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registrations_event_id_status_created_at_idx ON public.registrations USING btree (event_id, status, created_at);


--
-- Name: registrations_one_active_per_user_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX registrations_one_active_per_user_key ON public.registrations USING btree (event_id, user_id) WHERE (status <> 'CANCELLED'::public."RegistrationStatus");


--
-- Name: registrations_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registrations_user_id_created_at_idx ON public.registrations USING btree (user_id, created_at DESC);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: venues_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX venues_name_key ON public.venues USING btree (name);


--
-- Name: club_organisers club_organisers_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_organisers
    ADD CONSTRAINT club_organisers_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: club_organisers club_organisers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.club_organisers
    ADD CONSTRAINT club_organisers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: events events_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: events events_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: events events_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: registrations registrations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: registrations registrations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registrations
    ADD CONSTRAINT registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


