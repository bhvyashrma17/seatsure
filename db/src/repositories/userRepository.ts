import { prisma } from '../client';
import type { Tx } from '../transaction';

const publicUser = { id: true, name: true, email: true, role: true, department: true, yearOfStudy: true } as const;

/** Demo identity: the people a tester can "act as" (real login arrives in Module 4). */
export async function listDemoUsers(client: Tx = prisma) {
  return client.user.findMany({ select: publicUser, orderBy: [{ role: 'desc' }, { name: 'asc' }] });
}

/** A user plus the ids of the clubs they organise (used for permission checks). */
export async function findWithClubs(id: number, client: Tx = prisma) {
  const user = await client.user.findUnique({
    where: { id },
    select: { ...publicUser, clubRoles: { select: { clubId: true, title: true, club: { select: { name: true } } } } },
  });
  if (!user) return null;
  const { clubRoles, ...rest } = user;
  return {
    ...rest,
    clubs: clubRoles.map((c) => ({ id: c.clubId, name: c.club.name, title: c.title })),
  };
}
