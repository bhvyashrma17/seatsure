const TONES = {
  CONFIRMED: 'success',
  WAITLISTED: 'warning',
  CANCELLED: 'muted',
  PUBLISHED: 'success',
  DRAFT: 'info',
};

export function Badge({ children, tone }) {
  return <span className={`badge badge--${tone ?? TONES[children] ?? 'neutral'}`}>{children}</span>;
}
