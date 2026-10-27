// Creates the development and test databases named in .env if they do not exist yet.
// Usage: npm run db:create   (run once after installing PostgreSQL)
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const urls = [process.env.DATABASE_URL, process.env.DATABASE_URL_TEST].filter(Boolean);
if (urls.length === 0) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

for (const raw of urls) {
  const url = new URL(raw);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  // Connect to the always-present "postgres" maintenance database to issue CREATE DATABASE.
  url.pathname = '/postgres';
  url.search = '';
  const client = new pg.Client({ connectionString: url.toString() });
  try {
    await client.connect();
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rowCount) {
      console.log(`✓ database "${dbName}" already exists`);
    } else {
      // Identifiers cannot be parameterised; dbName comes from your own .env.
      await client.query(`CREATE DATABASE "${dbName.replaceAll('"', '""')}"`);
      console.log(`✓ created database "${dbName}"`);
    }
  } catch (err) {
    console.error(`✗ could not prepare "${dbName}": ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}
