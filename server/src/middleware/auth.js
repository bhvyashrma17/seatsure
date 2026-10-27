// Demo identity layer. Real authentication (passwords, sessions, JWT) is Backend Module 4, so in
// Modules 1-3 the client simply says who it is in the X-User-Id header and this middleware loads
// that user, the same `requireAuth -> req.user` contract the course uses in its route chains.
import { AppError } from '../utils/AppError.js';

export function createAuthMiddleware({ users }) {
  async function loadUser(req) {
    const raw = req.get('X-User-Id');
    if (!raw) return null;
    // Trust boundary: the header is client input, so validate it like any other input.
    if (!/^\d{1,9}$/.test(raw)) throw new AppError('X-User-Id must be a positive integer', 400, 'BAD_USER_HEADER');
    const user = await users.findWithClubs(Number(raw));
    if (!user) throw new AppError('Unknown user. Choose a demo user again.', 401, 'UNKNOWN_USER');
    return user;
  }

  /** Requires a known user (401 otherwise) and attaches it as req.user. */
  async function requireUser(req, res, next) {
    try {
      const user = await loadUser(req);
      if (!user) throw new AppError('Choose a demo user first (X-User-Id header missing).', 401, 'UNAUTHENTICATED');
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  }

  /** Attaches req.user when the header is present, but lets anonymous requests through. */
  async function optionalUser(req, res, next) {
    try {
      req.user = (await loadUser(req)) ?? undefined;
      next();
    } catch (err) {
      next(err);
    }
  }

  return { requireUser, optionalUser };
}

/** Role gate. Must run after requireUser. */
export const requireRole = (role) => (req, res, next) => {
  if (req.user?.role !== role) {
    return next(new AppError(`Only ${role.toLowerCase()}s can do this`, 403, 'FORBIDDEN_ROLE'));
  }
  next();
};
