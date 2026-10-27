import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';

export function createRegistrationsController({ registrationService }) {
  return {
    cancel: asyncHandler(async (req, res) => {
      ok(res, await registrationService.cancel(req.user, req.valid.params.id));
    }),

    checkIn: asyncHandler(async (req, res) => {
      ok(res, await registrationService.checkIn(req.user, req.valid.params.id));
    }),

    mine: asyncHandler(async (req, res) => {
      const items = await registrationService.listMine(req.user);
      ok(res, items, { total: items.length });
    }),

    /**
     * [BACKEND M2.2: Streams] CSV export. Rows are read in batches and pushed through a Readable
     * stream into the response, so memory use stays flat however many attendees there are, and
     * pipeline() applies backpressure (it waits whenever the client reads slowly).
     */
    exportCsv: asyncHandler(async (req, res) => {
      const lines = registrationService.exportCsv(req.user, req.valid.params.id);
      // Pull the header first: authorisation/404 errors surface before any byte is sent.
      const first = await lines.next();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="event-${req.valid.params.id}-attendees.csv"`);
      async function* all() {
        if (!first.done) yield first.value;
        yield* lines;
      }
      await pipeline(Readable.from(all()), res);
    }),
  };
}
