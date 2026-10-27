// [FULLSTACK M1.12: Compound components + named slots] <Card> knows nothing about events, passes or
// charts. Callers compose it from <Card.Header>, <Card.Body> and <Card.Footer> instead of
// passing twenty props.
export function Card({ children, as: Tag = 'article', className = '', ...rest }) {
  return (
    <Tag className={`card ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

function Header({ title, eyebrow, actions, children }) {
  return (
    <header className="card__header">
      <div className="card__titles">
        {eyebrow && <p className="card__eyebrow">{eyebrow}</p>}
        {title && <h3 className="card__title">{title}</h3>}
        {children}
      </div>
      {actions && <div className="card__actions">{actions}</div>}
    </header>
  );
}

function Body({ children, className = '' }) {
  return <div className={`card__body ${className}`}>{children}</div>;
}

function Footer({ children }) {
  return <footer className="card__footer">{children}</footer>;
}

Card.Header = Header;
Card.Body = Body;
Card.Footer = Footer;
