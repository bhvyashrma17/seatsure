// Label + control + error message, wired for accessibility (aria-invalid / aria-describedby).
import { cloneElement, useId } from 'react';

export function Field({ label, error, hint, children }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field ${error ? 'field--invalid' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {cloneElement(children, { id, 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': describedBy })}
      {hint && !error && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
