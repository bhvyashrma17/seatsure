// Campus times are shown in India Standard Time regardless of the viewer's machine settings.
const TZ = 'Asia/Kolkata';

const dayTime = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const timeOnly = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const dayOnly = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short' });

export const formatDateTime = (value) => (value ? dayTime.format(new Date(value)) : '-');
export const formatTime = (value) => (value ? timeOnly.format(new Date(value)) : '-');
export const formatDay = (value) => (value ? dayOnly.format(new Date(value)) : '-');

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** "Wed, 28 Oct, 3:00 pm - 6:00 pm", or the full end date when an event runs past midnight. */
export function formatRange(start, end) {
  if (!start) return '-';
  if (!end) return formatDateTime(start);
  const sameDay = dayKey.format(new Date(start)) === dayKey.format(new Date(end));
  return `${formatDateTime(start)} - ${sameDay ? formatTime(end) : formatDateTime(end)}`;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function timeAgo(value, now = Date.now()) {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}

export const CATEGORY_LABELS = {
  WORKSHOP: 'Workshop',
  HACKATHON: 'Hackathon',
  TALK: 'Talk',
  COMPETITION: 'Competition',
  CULTURAL: 'Cultural',
  SPORTS: 'Sports',
};

/** Converts a server field path ("questions[0].options") to a React Hook Form name ("questions.0.options"). */
export const toFormField = (path) => path.replace(/\[(\d+)\]/g, '.$1');
