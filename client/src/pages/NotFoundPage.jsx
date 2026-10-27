import { Link } from 'react-router-dom';
import { EmptyState } from '../shared/components/Feedback.jsx';

export default function NotFoundPage() {
  return (
    <section className="page page--narrow">
      <EmptyState title="Page not found" action={<Link className="btn btn--primary btn--sm" to="/events">Back to events</Link>}>
        The page you are looking for does not exist.
      </EmptyState>
    </section>
  );
}
