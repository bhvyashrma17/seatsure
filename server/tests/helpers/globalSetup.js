import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function setup() {
  execSync('npx prisma migrate deploy', {
    cwd: fileURLToPath(new URL('../../../db', import.meta.url)),
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
  });
}
