// [FULLSTACK M3.8: Offset pagination controls] Driven entirely by the API's meta: { page, totalPages, total }.
export function Pagination({ page, totalPages, total, onPageChange, disabled }) {
  if (!totalPages || totalPages <= 1) return total ? <p className="pagination__summary">{total} result{total === 1 ? '' : 's'}</p> : null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="btn btn--ghost btn--sm" onClick={() => onPageChange(page - 1)} disabled={disabled || page <= 1}>
        ← Previous
      </button>
      <span className="pagination__summary">
        Page {page} of {totalPages} · {total} total
      </span>
      <button className="btn btn--ghost btn--sm" onClick={() => onPageChange(page + 1)} disabled={disabled || page >= totalPages}>
        Next →
      </button>
    </nav>
  );
}
