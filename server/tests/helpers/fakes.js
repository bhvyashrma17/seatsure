// In-memory stand-ins for the PostgreSQL repositories. Services cannot tell the difference,
// which is the point of the repository pattern ([BACKEND M2.11]): business rules are tested here
// without any database.
export function createFakeStore({ now = () => new Date() } = {}) {
  const state = { events: new Map(), registrations: new Map(), outbox: [], venues: new Map(), nextReg: 1, nextEvent: 1 };
  const clone = (x) => (x ? structuredClone(x) : x);

  const events = {
    async findById(id) {
      return clone(state.events.get(id) ?? null);
    },
    async findDetail(id) {
      const e = state.events.get(id);
      if (!e) return null;
      const waitlisted = [...state.registrations.values()].filter((r) => r.eventId === id && r.status === 'WAITLISTED').length;
      return { ...clone(e), club: { id: e.clubId, name: e.clubName }, venue: state.venues.get(e.venueId), _count: { registrations: waitlisted } };
    },
    async lockForUpdate(_tx, id) {
      return clone(state.events.get(id) ?? null);
    },
    async changeConfirmedCount(_tx, id, delta) {
      const e = state.events.get(id);
      e.confirmedCount += delta;
      if (e.confirmedCount > e.capacity) throw Object.assign(new Error('check violation'), { kind: 'CHECK_VIOLATION' });
      return clone(e);
    },
    async create(data) {
      const e = { id: state.nextEvent++, status: 'DRAFT', confirmedCount: 0, publishedAt: null, clubName: 'Club', ...data };
      state.events.set(e.id, e);
      return clone(e);
    },
    async update(id, data) {
      Object.assign(state.events.get(id), data);
      return clone(state.events.get(id));
    },
    async remove(id) {
      state.events.delete(id);
    },
  };

  const registrations = {
    async create(_tx, data) {
      const r = { id: state.nextReg++, createdAt: new Date(now().getTime() + state.nextReg), promotedAt: null, cancelledAt: null, checkedInAt: null, ...data };
      state.registrations.set(r.id, r);
      return clone(r);
    },
    async findById(id) {
      const r = state.registrations.get(id);
      return r ? { ...clone(r), user: { name: `User ${r.userId}` } } : null;
    },
    async findActive(eventId, userId) {
      return clone([...state.registrations.values()].find((r) => r.eventId === eventId && r.userId === userId && r.status !== 'CANCELLED') ?? null);
    },
    async nextWaitlisted(_tx, eventId, count) {
      return [...state.registrations.values()]
        .filter((r) => r.eventId === eventId && r.status === 'WAITLISTED')
        .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)
        .slice(0, count)
        .map((r) => ({ id: r.id, userId: r.userId, userName: `User ${r.userId}` }));
    },
    async promote(_tx, ids, at) {
      for (const id of ids) Object.assign(state.registrations.get(id), { status: 'CONFIRMED', promotedAt: at });
      return ids.length;
    },
    async cancel(_tx, id, at) {
      Object.assign(state.registrations.get(id), { status: 'CANCELLED', cancelledAt: at });
    },
    async markCheckedIn(id, at) {
      const r = state.registrations.get(id);
      if (r.status !== 'CONFIRMED' || r.checkedInAt) return 0;
      r.checkedInAt = at;
      return 1;
    },
    async waitlistPositions(ids) {
      const map = new Map();
      for (const id of ids) {
        const r = state.registrations.get(id);
        const queue = [...state.registrations.values()].filter((x) => x.eventId === r.eventId && x.status === 'WAITLISTED').sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
        const pos = queue.findIndex((x) => x.id === id);
        if (pos >= 0) map.set(id, pos + 1);
      }
      return map;
    },
  };

  const outbox = {
    async add(_tx, type, payload) {
      state.outbox.push({ type, payload });
      return { id: BigInt(state.outbox.length) };
    },
  };

  const catalog = {
    async findVenue(id) {
      return state.venues.get(id) ?? null;
    },
  };

  // A "transaction" that just runs the work; tests can make it fail to simulate conflicts.
  const runInTransaction = async (work) => work({ fakeTx: true });

  return { state, events, registrations, outbox, catalog, runInTransaction };
}

export function addEvent(store, overrides = {}) {
  const e = {
    id: store.state.nextEvent++,
    clubId: 1,
    clubName: 'Coding Club',
    venueId: 1,
    title: 'Test Workshop',
    status: 'PUBLISHED',
    startsAt: new Date(Date.now() + 3 * 86_400_000),
    endsAt: new Date(Date.now() + 3 * 86_400_000 + 7_200_000),
    registrationClosesAt: null,
    capacity: 2,
    confirmedCount: 0,
    questions: [],
    ...overrides,
  };
  store.state.events.set(e.id, e);
  if (!store.state.venues.has(e.venueId)) store.state.venues.set(e.venueId, { id: e.venueId, name: 'Lab', capacity: 50 });
  return e;
}

export const student = (id = 101) => ({ id, name: `Student ${id}`, role: 'STUDENT', clubs: [] });
export const organiser = (clubId = 1, id = 1) => ({ id, name: 'Olivia Organiser', role: 'ORGANISER', clubs: [{ id: clubId, name: 'Coding Club' }] });
