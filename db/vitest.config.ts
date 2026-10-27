import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl || testUrl === process.env.DATABASE_URL) {
  throw new Error('Set DATABASE_URL_TEST in .env to a separate database (tests wipe it).');
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/globalSetup.ts'],
    // Every test file shares the one test database, so run files one after another.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
    env: { DATABASE_URL: testUrl, NODE_ENV: 'test' },
  },
});
