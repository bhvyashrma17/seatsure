import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

let loaded = false;

/**
 * Loads the shared project-root .env once. Variables that are already set (for example
 * DATABASE_URL injected by the test runner) win over the file, so tests never touch dev data.
 */
export function loadEnv(): void {
  if (loaded) return;
  config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
  loaded = true;
}
