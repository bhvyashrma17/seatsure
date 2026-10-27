#!/usr/bin/env node
// [FULLSTACK M1.8: Code splitting, measured] Builds the frontend with a Vite manifest and reports how much
// JavaScript (gzipped) a student downloads on a first visit to /events, and how much more the organiser
// area adds when an organiser opens it. Writes docs/test-results/bundle-split.json.
// Usage: npm run report:bundle
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}frontend/dist/`;
execSync('npx vite build --manifest', { cwd: `${root}frontend`, stdio: 'pipe' });
const manifest = JSON.parse(readFileSync(`${dist}.vite/manifest.json`, 'utf8'));

// Every JavaScript file a manifest entry needs before it can run (itself + static imports, recursively).
function closure(key, seen = new Set()) {
  const chunk = manifest[key];
  if (!chunk || seen.has(chunk.file)) return seen;
  seen.add(chunk.file);
  for (const dep of chunk.imports ?? []) closure(dep, seen);
  return seen;
}

const gzipKB = (files) => [...files].reduce((sum, f) => sum + gzipSync(readFileSync(dist + f)).length, 0) / 1024;
const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry);

// First visit: the entry (router, layout, providers) plus the lazy catalogue page.
const firstVisit = new Set([...closure(entryKey), ...closure('src/features/events/EventsPage.jsx')]);

// Organiser area: every organiser page, minus what the student already downloaded.
const organiserPages = Object.keys(manifest).filter((k) => k.startsWith('src/features/organiser/') && manifest[k].isDynamicEntry);
const organiserAll = new Set(organiserPages.flatMap((k) => [...closure(k)]));
const organiserExtra = new Set([...organiserAll].filter((f) => !firstVisit.has(f)));

const allJs = new Set(Object.values(manifest).map((c) => c.file).filter((f) => f.endsWith('.js')));
const result = {
  firstVisitKB: gzipKB(firstVisit).toFixed(1),
  firstVisitFiles: firstVisit.size,
  organiserExtraKB: gzipKB(organiserExtra).toFixed(1),
  organiserExtraFiles: organiserExtra.size,
  totalKB: gzipKB(allJs).toFixed(1),
  totalFiles: allJs.size,
  entryKB: gzipKB(new Set([manifest[entryKey].file])).toFixed(1),
};
writeFileSync(`${root}docs/test-results/bundle-split.json`, JSON.stringify(result, null, 2) + '\n');
console.log(result);
