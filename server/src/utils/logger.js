// Tiny structured logger. Quiet during automated tests unless LOG_LEVEL is set.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const threshold = LEVELS[process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info')] ?? 20;

function write(level, message, fields) {
  if (LEVELS[level] < threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const extra = fields && Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : '';
  (level === 'error' ? console.error : console.log)(line + extra);
}

export const logger = {
  debug: (msg, fields) => write('debug', msg, fields),
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields),
};
