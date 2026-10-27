// Seeds realistic, deterministic demo data: 8 clubs, 8 venues, 230 users, 30 events,
// ~2,500 registrations (confirmed, waitlisted, promoted, cancelled, checked-in) and personal to-do tasks.
// Only PostgreSQL (the source of truth) is written. Each change is also written to the outbox,
// so when the API starts, the dispatcher replays the history into MongoDB.
//
// Usage: npm run db:seed   (wipes and refills the database named in DATABASE_URL)
import { prisma } from '../src/client';
import { connectMongo, disconnectMongo } from '../src/mongo/connection';
import { ActivityLog } from '../src/mongo/models/ActivityLog';
import { Notification } from '../src/mongo/models/Notification';
import { OUTBOX, eventMessage, registrationMessage, type EventRef } from '../src/outboxMessages';
import { CLUBS, DEPARTMENTS, EVENTS, FIRST_NAMES, LAST_NAMES, ORGANISERS, VENUES } from './seed-data';

// Deterministic PRNG (mulberry32): the same seed produces the same data every run.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261027);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const between = (lo: number, hi: number) => lo + (hi - lo) * rand();

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = new Date();

/** A wall-clock time on campus (IST, UTC+05:30) `dayOffset` days from today. */
function campusTime(dayOffset: number, hour: number): Date {
  const ist = new Date(now.getTime() + 5.5 * HOUR);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate() + dayOffset;
  return new Date(Date.UTC(y, m, d, hour, 0, 0) - 5.5 * HOUR);
}

type Question = { id: string; type: 'text' | 'select' | 'boolean'; required: boolean; options?: string[] };

function answersFor(questions: readonly Question[]) {
  const out: Record<string, string | boolean> = {};
  for (const q of questions) {
    if (q.type === 'boolean') out[q.id] = rand() < 0.85;
    else if (q.type === 'select') out[q.id] = pick(q.options ?? ['']);
    else if (q.required || rand() < 0.4) out[q.id] = q.id === 'team' ? `${pick(['Byte', 'Null', 'Pixel', 'Quantum', 'Stack'])} ${pick(['Busters', 'Pointers', 'Ninjas', 'Wizards', 'Squad'])}` : 'Looking forward to it!';
  }
  return out;
}

async function main() {
  console.log(`Seeding ${process.env.DATABASE_URL?.replace(/\/\/[^@]*@/, '//***@')} ...`);

  // 1. Start clean (child tables first is handled by CASCADE).
  await prisma.$executeRawUnsafe(
    'TRUNCATE tasks, outbox_events, registrations, events, club_organisers, venues, clubs, users RESTART IDENTITY CASCADE',
  );
  await clearMongoIfConfigured();

  // 2. Reference data.
  await prisma.club.createMany({ data: CLUBS.map((c) => ({ ...c })) });
  await prisma.venue.createMany({ data: VENUES.map((v) => ({ ...v })) });
  const clubs = await prisma.club.findMany({ orderBy: { id: 'asc' } });
  const venues = await prisma.venue.findMany({ orderBy: { id: 'asc' } });

  // 3. People: organisers first (ids 1..10), then students.
  const organisers = await prisma.user.createManyAndReturn({
    data: ORGANISERS.map((o) => ({
      name: o.name,
      email: `${o.name.toLowerCase().replace(/\s+/g, '.')}@clubs.example.edu`,
      role: 'ORGANISER' as const,
      department: o.department,
      yearOfStudy: o.year,
    })),
  });
  await prisma.clubOrganiser.createMany({
    data: ORGANISERS.flatMap((o, i) =>
      o.clubs.map((clubIndex, k) => ({ clubId: clubs[clubIndex]!.id, userId: organisers[i]!.id, title: k === 0 && i < 8 ? 'Club Lead' : 'Co-organiser' })),
    ),
  });

  const usedNames = new Set<string>(ORGANISERS.map((o) => o.name));
  const studentRows: { name: string; email: string; department: string; yearOfStudy: number }[] = [];
  // A predictable first student for demos.
  studentRows.push({ name: 'Priya Singh', email: 'priya.singh@students.example.edu', department: 'CSE (AI & Future Technologies)', yearOfStudy: 2 });
  usedNames.add('Priya Singh');
  while (studentRows.length < 220) {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    studentRows.push({
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}@students.example.edu`,
      department: pick(DEPARTMENTS),
      yearOfStudy: 1 + Math.floor(rand() * 4),
    });
  }
  const students = await prisma.user.createManyAndReturn({ data: studentRows.map((s) => ({ ...s, role: 'STUDENT' as const })) });
  const userName = new Map([...organisers, ...students].map((u) => [u.id, u.name]));

  // 4. Events + registrations, simulated in time order so statuses are internally consistent.
  type Msg = { type: string; at: Date; payload: object };
  const outbox: Msg[] = [];
  let totalRegs = 0;

  for (const spec of EVENTS) {
    const club = clubs[spec.club]!;
    const venue = venues[spec.venue]!;
    const lead = organisers[spec.club]!;
    const startsAt = spec.startsInHours
      ? new Date(Math.ceil((now.getTime() + spec.startsInHours * HOUR) / HOUR) * HOUR)
      : campusTime(spec.dayOffset, spec.hour);
    const endsAt = new Date(startsAt.getTime() + spec.durationH * HOUR);
    const publishedAt = new Date(Math.min(startsAt.getTime() - 21 * DAY, now.getTime() - 20 * DAY));
    const capacity = Math.min(spec.capacity, venue.capacity);

    const event = await prisma.event.create({
      data: {
        clubId: club.id,
        venueId: venue.id,
        createdById: lead.id,
        title: spec.title,
        description: spec.description,
        category: spec.category,
        status: 'PUBLISHED',
        startsAt,
        endsAt,
        registrationClosesAt: new Date(startsAt.getTime() - 2 * HOUR),
        capacity,
        questions: spec.questions,
        publishedAt,
        createdAt: new Date(publishedAt.getTime() - 2 * DAY),
      },
    });
    const ref: EventRef = { eventId: event.id, eventTitle: event.title, clubId: club.id, clubName: club.name };
    outbox.push({ type: OUTBOX.EVENT_PUBLISHED, at: publishedAt, payload: eventMessage(ref, lead, publishedAt) });

    // Demand: how many students try to register (popular events overflow into the waitlist).
    const demand = Math.min(students.length, Math.round(capacity * spec.popularity * between(0.8, 1.1)));
    const registrants = [...students].sort(() => rand() - 0.5).slice(0, demand);
    const windowStart = Math.max(publishedAt.getTime(), now.getTime() - 21 * DAY);
    const windowEnd = Math.min(startsAt.getTime() - 3 * HOUR, now.getTime() - 5 * 60_000);

    const regs = registrants
      .map((u) => ({ userId: u.id, createdAt: new Date(between(windowStart, windowEnd)) }))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((r, i) => ({
        ...r,
        status: (i < capacity ? 'CONFIRMED' : 'WAITLISTED') as 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED',
        position: i < capacity ? undefined : i - capacity + 1,
        answers: answersFor(spec.questions),
        promotedAt: null as Date | null,
        cancelledAt: null as Date | null,
        checkedInAt: null as Date | null,
      }));

    // Some people cancel later; a cancelled confirmed seat promotes the oldest waitlisted person.
    const cancellations = regs
      .filter(() => rand() < 0.08)
      .map((r) => ({ r, at: new Date(between(r.createdAt.getTime(), Math.max(r.createdAt.getTime() + 60_000, windowEnd))) }))
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    const promotions: { r: (typeof regs)[number]; at: Date }[] = [];
    for (const { r, at } of cancellations) {
      const wasConfirmed = r.status === 'CONFIRMED';
      r.status = 'CANCELLED';
      r.cancelledAt = at;
      if (wasConfirmed) {
        const next = regs.find((x) => x.status === 'WAITLISTED');
        if (next) {
          next.status = 'CONFIRMED';
          next.promotedAt = at;
          promotions.push({ r: next, at });
        }
      }
    }

    // Past events: most confirmed attendees actually turned up.
    if (startsAt < now) {
      for (const r of regs) if (r.status === 'CONFIRMED' && rand() < 0.82) r.checkedInAt = new Date(startsAt.getTime() + between(0, 40) * 60_000);
    }

    const created = await prisma.registration.createManyAndReturn({
      data: regs.map((r) => ({
        eventId: event.id,
        userId: r.userId,
        status: r.status,
        answers: r.answers,
        createdAt: r.createdAt,
        promotedAt: r.promotedAt,
        cancelledAt: r.cancelledAt,
        checkedInAt: r.checkedInAt,
      })),
      select: { id: true, userId: true },
    });
    const confirmed = regs.filter((r) => r.status === 'CONFIRMED').length;
    await prisma.event.update({ where: { id: event.id }, data: { confirmedCount: confirmed } });
    totalRegs += created.length;

    // Outbox history for MongoDB (activity feed + notifications).
    regs.forEach((r, i) => {
      const reg = { id: created[i]!.id, userId: r.userId, userName: userName.get(r.userId)! };
      const initial = r.position === undefined ? OUTBOX.REGISTRATION_CONFIRMED : OUTBOX.REGISTRATION_WAITLISTED;
      outbox.push({ type: initial, at: r.createdAt, payload: registrationMessage(ref, reg, r.createdAt, r.position ? { position: r.position } : {}) });
      if (r.cancelledAt) outbox.push({ type: OUTBOX.REGISTRATION_CANCELLED, at: r.cancelledAt, payload: registrationMessage(ref, reg, r.cancelledAt) });
      if (r.checkedInAt) outbox.push({ type: OUTBOX.REGISTRATION_CHECKED_IN, at: r.checkedInAt, payload: registrationMessage(ref, reg, r.checkedInAt, { byOrganiser: true }) });
    });
    for (const { r, at } of promotions) {
      const i = regs.indexOf(r);
      const reg = { id: created[i]!.id, userId: r.userId, userName: userName.get(r.userId)! };
      outbox.push({ type: OUTBOX.REGISTRATION_PROMOTED, at, payload: registrationMessage(ref, reg, at) });
    }
  }

  // Two drafts so the organiser dashboard has something to publish during the demo.
  const aiClub = clubs[1]!;
  const robotics = clubs[2]!;
  await prisma.event.createMany({
    data: [
      {
        clubId: aiClub.id, venueId: venues[1]!.id, createdById: organisers[1]!.id, title: 'Panel: AI Ethics on Campus',
        description: 'Faculty and students debate where AI tools help learning, and where they hurt it.',
        category: 'TALK', status: 'DRAFT', startsAt: campusTime(19, 16), endsAt: campusTime(19, 18), capacity: 100,
        questions: [{ id: 'question', label: 'A question for the panel (optional)', type: 'text', required: false }],
      },
      {
        clubId: robotics.id, venueId: venues[7]!.id, createdById: organisers[2]!.id, title: 'Robo Soccer Trials',
        description: 'Trials for the inter-college robo soccer team.', category: 'COMPETITION', status: 'DRAFT',
        startsAt: campusTime(26, 10), endsAt: campusTime(26, 15), capacity: 32,
        questions: [{ id: 'team', label: 'Team name', type: 'text', required: true }],
      },
    ],
  });

  outbox.sort((a, b) => a.at.getTime() - b.at.getTime());
  await prisma.outboxEvent.createMany({ data: outbox.map((m) => ({ type: m.type, payload: m.payload, createdAt: m.at })) });

  // 6. Personal to-do tasks (the tasks CRUD feature). A separate PRNG keeps the event data above identical.
  const taskCount = await seedTasks(students, organisers);

  const counts = await prisma.registration.groupBy({ by: ['status'], _count: true });
  console.log(`✓ ${clubs.length} clubs, ${venues.length} venues, ${organisers.length + students.length} users`);
  console.log(`✓ ${EVENTS.length + 2} events, ${totalRegs} registrations:`, Object.fromEntries(counts.map((c) => [c.status, c._count])));
  console.log('  Tip: re-run the seed on demo day so the "Resume & LinkedIn Review Drop-in" starts about an hour later (check-in demo).');
  console.log(`✓ ${outbox.length} outbox messages queued for MongoDB (delivered when the API starts)`);
  console.log(`✓ ${taskCount} to-do tasks`);
}

/** A calendar date on campus (IST) `dayOffset` days from today, stored as a DATE. */
function campusDate(dayOffset: number): Date {
  const ist = new Date(now.getTime() + 5.5 * HOUR);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + dayOffset));
}

async function seedTasks(students: { id: number; name: string }[], organisers: { id: number; name: string }[]) {
  const taskRand = rng(113);
  type SeedTask = { userId: number; title: string; notes?: string; dueDate?: Date; completed?: boolean };
  const priya = students.find((s) => s.name === 'Priya Singh')!;
  const aarav = organisers.find((o) => o.name === 'Aarav Mehta')!;
  const tasks: SeedTask[] = [
    { userId: priya.id, title: 'Print my resume for the LinkedIn review', dueDate: campusDate(0) },
    { userId: priya.id, title: 'Finish the Figma basics tutorial', notes: 'Frames and auto layout, before the Figma workshop', dueDate: campusDate(4) },
    { userId: priya.id, title: 'Read the transformer paper summary', notes: 'Sections 1-3 before the reading group', dueDate: campusDate(6) },
    { userId: priya.id, title: 'Bring a laptop charger to HackNight', dueDate: campusDate(12) },
    { userId: priya.id, title: 'Submit the micro project report', completed: true },
    { userId: aarav.id, title: 'Book the projector for the portfolio workshop', completed: true },
    { userId: aarav.id, title: 'Email mentors about HackNight judging', dueDate: campusDate(7) },
    { userId: aarav.id, title: 'Print attendee badges', notes: 'Use the CSV export from the attendee list', dueDate: campusDate(11) },
  ];
  const ideas = ['Revise notes for the quiz', 'Charge the power bank', 'Update my GitHub profile', 'Practise the pitch', 'Buy a notebook', 'Fill in the club feedback form', 'Install Git and VS Code', 'Pack the team T-shirt'];
  for (const s of students.filter((st) => st.id !== priya.id).slice(0, 40)) {
    const n = Math.floor(taskRand() * 3);
    for (let i = 0; i < n; i++) {
      tasks.push({ userId: s.id, title: ideas[Math.floor(taskRand() * ideas.length)]!, dueDate: taskRand() < 0.6 ? campusDate(Math.floor(taskRand() * 14)) : undefined, completed: taskRand() < 0.3 });
    }
  }
  await prisma.task.createMany({
    data: tasks.map((t) => ({ ...t, completed: t.completed ?? false, completedAt: t.completed ? new Date(now.getTime() - DAY) : null })),
  });
  return tasks.length;
}

/** A persistent MongoDB (Atlas / local) holds documents derived from the old data: clear them too. */
async function clearMongoIfConfigured() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return; // in-memory MongoDB is rebuilt from the outbox on every API start
  try {
    await connectMongo(uri);
    await Promise.all([Notification.deleteMany({}), ActivityLog.deleteMany({})]);
    console.log('✓ cleared MongoDB notifications and activity (they are rebuilt from the outbox)');
  } catch (err) {
    console.warn(`! could not clear MongoDB (${(err as Error).message}); continuing with PostgreSQL only`);
  } finally {
    await disconnectMongo().catch(() => {});
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
