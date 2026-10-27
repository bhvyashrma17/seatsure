export function Button({ variant = 'primary', size = 'md', loading = false, disabled, children, className = '', ...rest }) {
  return (
    <button className={`btn btn--${variant} btn--${size} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="spinner spinner--inline" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}
