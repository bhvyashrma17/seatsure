// Prisma 7 CLI configuration (same layout `prisma init` generates in ADB M2.1).
// The shared .env lives at the project root, so load it explicitly.
// [DATABASE M2.20: Production readiness] Development evolves the schema with `prisma migrate dev`;
// tests and production only apply committed migrations with `prisma migrate deploy` (npm run db:migrate).
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
