// Brings the test database schema up to date once before any test file runs.
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function setup() {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  execSync('npx prisma migrate deploy', {
    cwd,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
  });
}
