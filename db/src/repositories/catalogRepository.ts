// Reference data for filters and forms: clubs and venues.
import { prisma } from '../client';
import type { Tx } from '../transaction';

export async function listClubs(client: Tx = prisma) {
  return client.club.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      // Count only published events (filtered relation count).
      _count: { select: { events: { where: { status: 'PUBLISHED' } } } },
    },
  });
}

export async function listVenues(client: Tx = prisma) {
  return client.venue.findMany({ orderBy: { name: 'asc' } });
}

export async function findVenue(id: number, client: Tx = prisma) {
  return client.venue.findUnique({ where: { id } });
}
