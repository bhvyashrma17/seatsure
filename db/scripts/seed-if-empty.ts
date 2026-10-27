// Hosting helper, run before each deploy right after the migrations: loads the demo data only when
// the database has no users yet, so a redeploy never wipes existing data.
// To reload the demo data on Railway later:  railway ssh --service seatsure -- npm run db:seed
// Usage: npm run db:seed:if-empty
import { loadEnv } from '../src/env';

loadEnv();

const { prisma } = await import('../src/client');
const users = await prisma.user.count();

if (users > 0) {
  console.log(`Database already has ${users} users: demo seed skipped.`);
  await prisma.$disconnect();
} else {
  console.log('Empty database: loading the demo seed.');
  await import('../prisma/seed'); // runs the seed and disconnects when it finishes
}
