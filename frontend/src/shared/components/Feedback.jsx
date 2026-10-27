// Small shared building blocks for loading, empty and error states.
export function Spinner({ label = 'Loading' }) {
  return (
    <div className="state state--loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}...</span>
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="state state--empty">
      <p className="state__title">{title}</p>
      {children && <p className="state__text">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <p className="state__title">{error?.message ?? 'Something went wrong'}</p>
      {error?.requestId && <p className="state__meta">Request id: {error.requestId}</p>}
      {onRetry && (
        <button className="btn btn--secondary btn--sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Fallback UI for react-error-boundary ([FULLSTACK M1.9]). */
export function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="state state--error" role="alert">
      <p className="state__title">This part of the page crashed.</p>
      <p className="state__text">{error?.message}</p>
      <button className="btn btn--secondary btn--sm" onClick={resetErrorBoundary}>
        Try again
      </button>
    </div>
  );
}
