// [BACKEND M2.7] [BACKEND M1.8: async/await error handling] Wraps an async route handler so any
// rejection reaches the central error handler via next(err). Handlers stay free of try/catch boilerplate.
// (Express 5 also forwards rejected promises, but the explicit wrapper keeps the contract visible
// and works the same on Express 4.)
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
