export function SeatMeter({ capacity, confirmed, compact = false }) {
  const pct = capacity ? Math.min(100, Math.round((confirmed / capacity) * 100)) : 0;
  const left = Math.max(0, capacity - confirmed);
  const tone = left === 0 ? 'full' : pct >= 80 ? 'hot' : 'open';
  return (
    <div className={`seat-meter seat-meter--${tone} ${compact ? 'seat-meter--compact' : ''}`}>
      <div className="seat-meter__bar" role="progressbar" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={confirmed} aria-label="Seats taken">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="seat-meter__label">{left === 0 ? 'Full · waitlist open' : `${left} of ${capacity} seats left`}</p>
    </div>
  );
}
