// [FULLSTACK M1.6: React Hook Form] The registration form is generated from the event's own questions
// (stored as JSONB). Each question becomes a registered field with its own validation rules.
// [FULLSTACK M2.9: RHF + TanStack mutation] Submitting runs the register mutation; server-side answer
// errors (422) are mapped back onto the matching fields with setError.
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router-dom';
import { Badge } from '../../shared/components/Badge.jsx';
import { Button } from '../../shared/components/Button.jsx';
import { Card } from '../../shared/components/Card.jsx';
import { Field } from '../../shared/components/Field.jsx';
import { useToast } from '../../shared/components/Toast.jsx';
import { formatDateTime, toFormField } from '../../shared/lib/format.js';
import { useCancelRegistration } from '../registrations/hooks/useMyRegistrations.js';
import { useCurrentUser } from '../users/index.js';
import { useRegister } from './hooks/useEvents.js';

function QuestionField({ question, register, error }) {
  const name = `answers.${question.id}`;
  const rules = { required: question.required ? `"${question.label}" is required` : false };
  if (question.type === 'boolean') {
    return (
      <Field label={question.label} error={error}>
        <select className="input" defaultValue="" {...register(name, rules)}>
          <option value="" disabled>
            Choose…
          </option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </Field>
    );
  }
  if (question.type === 'select') {
    return (
      <Field label={question.label} error={error}>
        <select className="input" defaultValue="" {...register(name, rules)}>
          <option value="" disabled>
            Choose…
          </option>
          {question.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  return (
    <Field label={question.label} error={error}>
      <input className="input" maxLength={200} {...register(name, { ...rules, maxLength: { value: 200, message: 'Keep it under 200 characters' } })} />
    </Field>
  );
}

export function RegistrationPanel({ event }) {
  const { user, userId } = useCurrentUser();
  const location = useLocation();
  const toast = useToast();
  const registerMutation = useRegister(event.id);
  const cancelMutation = useCancelRegistration();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm({ mode: 'onTouched', defaultValues: { answers: {} } });

  const mine = event.myRegistration;
  const closesAt = event.registrationClosesAt ?? event.startsAt;
  const isClosed = new Date(closesAt) <= new Date() || event.status !== 'PUBLISHED';

  async function onSubmit(values) {
    try {
      const res = await registerMutation.mutateAsync(values.answers ?? {});
      const { outcome, position } = res.data;
      toast.show(outcome === 'CONFIRMED' ? "You're in! Seat confirmed." : `Event is full: you are #${position} on the waitlist.`, {
        tone: outcome === 'CONFIRMED' ? 'success' : 'warning',
      });
      reset();
    } catch (err) {
      const fields = Object.entries(err.fieldErrors ?? {});
      if (fields.length) {
        for (const [field, message] of fields) setError(toFormField(field), { type: 'server', message });
      } else {
        toast.show(err.message, { tone: 'error' });
      }
    }
  }

  function onCancel() {
    cancelMutation.mutate(
      { registrationId: mine.id, eventId: event.id },
      {
        onSuccess: (res) =>
          toast.show(res.data.promoted ? 'Cancelled. Your seat went to the next person on the waitlist.' : 'Registration cancelled.', { tone: 'info' }),
        onError: (err) => toast.show(err.message, { tone: 'error' }),
      },
    );
  }

  if (!userId) {
    return (
      <Card>
        <Card.Header title="Register" />
        <Card.Body>
          <p>Choose a demo user to register.</p>
        </Card.Body>
        <Card.Footer>
          <Link className="btn btn--primary btn--sm" to={`/choose-user?next=${encodeURIComponent(location.pathname)}`}>
            Choose user
          </Link>
        </Card.Footer>
      </Card>
    );
  }

  if (mine) {
    return (
      <Card className={`registration registration--${mine.status.toLowerCase()}`}>
        <Card.Header title="Your registration" actions={<Badge>{mine.status}</Badge>} />
        <Card.Body>
          {mine.status === 'CONFIRMED' ? (
            <p>Your seat is confirmed, {user?.name?.split(' ')[0] ?? 'there'}. See you there!</p>
          ) : (
            <p>
              You are <strong>#{mine.position}</strong> on the waitlist. If someone cancels, you move up automatically and get a notification.
            </p>
          )}
          <p className="muted small">Registered {formatDateTime(mine.createdAt)}</p>
        </Card.Body>
        {new Date(event.startsAt) > new Date() && (
          <Card.Footer>
            <Button variant="danger" size="sm" onClick={onCancel} loading={cancelMutation.isPending}>
              Cancel registration
            </Button>
          </Card.Footer>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header title={event.isFull ? 'Join the waitlist' : 'Register'} eyebrow={isClosed ? 'Registration closed' : `Closes ${formatDateTime(closesAt)}`} />
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card.Body>
          {event.questions.length === 0 && <p className="muted">No questions for this event, just confirm below.</p>}
          {event.questions.map((q) => (
            <QuestionField key={q.id} question={q} register={register} error={errors.answers?.[q.id]?.message} />
          ))}
        </Card.Body>
        <Card.Footer>
          <Button type="submit" loading={registerMutation.isPending} disabled={isClosed}>
            {event.isFull ? 'Join waitlist' : 'Confirm my seat'}
          </Button>
        </Card.Footer>
      </form>
    </Card>
  );
}
