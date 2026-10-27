// [FULLSTACK M1.6: React Hook Form] Create / edit an event. useFieldArray manages the dynamic list of
// custom questions; custom `validate` rules check cross-field logic (end after start, capacity
// within the chosen venue) before anything is sent.
// [FULLSTACK M2.9: RHF + mutation] Server validation errors (400/422) are mapped back onto fields.
import { useEffect } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../shared/components/Button.jsx';
import { Card } from '../../shared/components/Card.jsx';
import { ErrorState, Spinner } from '../../shared/components/Feedback.jsx';
import { Field } from '../../shared/components/Field.jsx';
import { useToast } from '../../shared/components/Toast.jsx';
import { CATEGORY_LABELS, toFormField } from '../../shared/lib/format.js';
import { useVenues } from '../events/index.js';
import { useCurrentUser } from '../users/index.js';
import { useCreateEvent, useOrganiserEvent, useUpdateEvent } from './hooks/useOrganiser.js';

// <input type="datetime-local"> works in the browser's local time without a zone.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const toIso = (local) => (local ? new Date(local).toISOString() : null);
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'q_$1')
    .slice(0, 24) || 'question';

const emptyQuestion = { label: '', type: 'text', required: false, options: '' };

function toFormValues(event, defaultClubId) {
  if (!event) {
    return { clubId: defaultClubId ?? '', venueId: '', title: '', description: '', category: 'WORKSHOP', startsAt: '', endsAt: '', registrationClosesAt: '', capacity: 40, questions: [] };
  }
  return {
    clubId: event.clubId,
    venueId: event.venueId,
    title: event.title,
    description: event.description,
    category: event.category,
    startsAt: toLocalInput(event.startsAt),
    endsAt: toLocalInput(event.endsAt),
    registrationClosesAt: toLocalInput(event.registrationClosesAt),
    capacity: event.capacity,
    questions: (event.questions ?? []).map((q) => ({ ...q, options: (q.options ?? []).join(', ') })),
  };
}

function toPayload(values, { includeQuestions, includeClub }) {
  const used = new Set();
  const questions = values.questions.map((q) => {
    let id = q.id || slug(q.label);
    while (used.has(id)) id = `${id.slice(0, 21)}_${used.size}`;
    used.add(id);
    const out = { id, label: q.label.trim(), type: q.type, required: Boolean(q.required) };
    if (q.type === 'select') out.options = q.options.split(',').map((o) => o.trim()).filter(Boolean);
    return out;
  });
  return {
    ...(includeClub ? { clubId: Number(values.clubId) } : {}),
    venueId: Number(values.venueId),
    title: values.title.trim(),
    description: values.description.trim(),
    category: values.category,
    startsAt: toIso(values.startsAt),
    endsAt: toIso(values.endsAt),
    registrationClosesAt: toIso(values.registrationClosesAt),
    capacity: Number(values.capacity),
    ...(includeQuestions ? { questions } : {}),
  };
}

export default function EventFormPage() {
  const { eventId } = useParams();
  const isEdit = Boolean(eventId);
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useCurrentUser();
  const { data: venues = [] } = useVenues();
  const existing = useOrganiserEvent(eventId);
  const create = useCreateEvent();
  const update = useUpdateEvent();

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({ mode: 'onTouched', defaultValues: toFormValues(null, user?.clubs?.[0]?.id) });
  const { fields, append, remove } = useFieldArray({ control, name: 'questions' });
  const venueId = useWatch({ control, name: 'venueId' });
  const questionTypes = useWatch({ control, name: 'questions' });
  const selectedVenue = venues.find((v) => v.id === Number(venueId));
  const questionsLocked = isEdit && existing.data?.status !== 'DRAFT';

  useEffect(() => {
    if (existing.data) reset(toFormValues(existing.data));
  }, [existing.data, reset]);

  // On a direct page load the profile arrives after the form mounts: default the club then.
  useEffect(() => {
    if (!isEdit && user?.clubs?.length && !getValues('clubId')) setValue('clubId', user.clubs[0].id);
  }, [isEdit, user, getValues, setValue]);

  async function onSubmit(values) {
    try {
      if (isEdit) {
        const res = await update.mutateAsync({ eventId: Number(eventId), changes: toPayload(values, { includeQuestions: !questionsLocked, includeClub: false }) });
        const promoted = res.meta?.promotedFromWaitlist ?? 0;
        toast.show(promoted ? `Saved. ${promoted} people moved off the waitlist into the new seats.` : 'Changes saved', { tone: 'success' });
      } else {
        const res = await create.mutateAsync(toPayload(values, { includeQuestions: true, includeClub: true }));
        toast.show(`Draft "${res.data.title}" created. Publish it when you are ready.`, { tone: 'success' });
      }
      navigate('/organiser');
    } catch (err) {
      const fieldErrors = Object.entries(err.fieldErrors ?? {});
      for (const [field, message] of fieldErrors) setError(toFormField(field), { type: 'server', message });
      if (!fieldErrors.length) toast.show(err.message, { tone: 'error' });
    }
  }

  if (isEdit && existing.isPending) return <Spinner label="Loading event" />;
  if (isEdit && existing.error) return <ErrorState error={existing.error} onRetry={existing.refetch} />;

  return (
    <form className="stack" onSubmit={handleSubmit(onSubmit)} noValidate>
      <Card>
        <Card.Header title={isEdit ? `Edit "${existing.data.title}"` : 'Create an event'} eyebrow={isEdit ? existing.data.status : 'Saved as a draft first'} />
        <Card.Body className="form-grid">
          {!isEdit && (
            <Field label="Club" error={errors.clubId?.message}>
              <select className="input" {...register('clubId', { required: 'Choose a club' })}>
                {user?.clubs?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Title" error={errors.title?.message}>
            <input
              className="input"
              {...register('title', {
                required: 'Title is required',
                minLength: { value: 5, message: 'At least 5 characters' },
                maxLength: { value: 120, message: 'At most 120 characters' },
              })}
            />
          </Field>
          <Field label="Category" error={errors.category?.message}>
            <select className="input" {...register('category', { required: true })}>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Venue" error={errors.venueId?.message} hint={selectedVenue ? `Holds ${selectedVenue.capacity} people` : undefined}>
            <select className="input" {...register('venueId', { required: 'Choose a venue' })}>
              <option value="">Choose a venue…</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.building} ({v.capacity})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Capacity" error={errors.capacity?.message}>
            <input
              className="input"
              type="number"
              min={1}
              {...register('capacity', {
                required: 'Capacity is required',
                valueAsNumber: true,
                min: { value: 1, message: 'At least 1 seat' },
                max: { value: 2000, message: 'At most 2000 seats' },
                validate: (value) => !selectedVenue || value <= selectedVenue.capacity || `The venue holds at most ${selectedVenue.capacity}`,
              })}
            />
          </Field>
          <Field label="Starts" error={errors.startsAt?.message}>
            <input
              className="input"
              type="datetime-local"
              {...register('startsAt', {
                required: 'Start time is required',
                validate: (v) => new Date(v) > new Date() || 'The event must start in the future',
              })}
            />
          </Field>
          <Field label="Ends" error={errors.endsAt?.message}>
            <input
              className="input"
              type="datetime-local"
              {...register('endsAt', {
                required: 'End time is required',
                validate: (v) => new Date(v) > new Date(getValues('startsAt')) || 'The event must end after it starts',
              })}
            />
          </Field>
          <Field label="Registration closes (optional)" error={errors.registrationClosesAt?.message} hint="Defaults to the start time">
            <input
              className="input"
              type="datetime-local"
              {...register('registrationClosesAt', {
                validate: (v) => !v || new Date(v) <= new Date(getValues('startsAt')) || 'Must close before the event starts',
              })}
            />
          </Field>
          <div className="form-grid__full">
            <Field label="Description" error={errors.description?.message}>
              <textarea
                className="input"
                rows={4}
                {...register('description', {
                  required: 'Description is required',
                  minLength: { value: 20, message: 'At least 20 characters' },
                  maxLength: { value: 2000, message: 'At most 2000 characters' },
                })}
              />
            </Field>
          </div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header
          title="Registration questions"
          eyebrow={questionsLocked ? 'Locked after publishing' : 'Up to 5, stored as JSONB'}
          actions={
            !questionsLocked && (
              <Button type="button" variant="secondary" size="sm" onClick={() => append(emptyQuestion)} disabled={fields.length >= 5}>
                + Add question
              </Button>
            )
          }
        />
        <Card.Body>
          {fields.length === 0 && <p className="muted">No questions: students register with one click.</p>}
          {fields.map((field, index) => (
            <fieldset key={field.id} className="question-row" disabled={questionsLocked}>
              <legend className="visually-hidden">Question {index + 1}</legend>
              <Field label={`Question ${index + 1}`} error={errors.questions?.[index]?.label?.message}>
                <input className="input" {...register(`questions.${index}.label`, { required: 'Write the question', minLength: { value: 3, message: 'At least 3 characters' } })} />
              </Field>
              <Field label="Type">
                <select className="input" {...register(`questions.${index}.type`)}>
                  <option value="text">Short text</option>
                  <option value="select">Choice</option>
                  <option value="boolean">Yes / No</option>
                </select>
              </Field>
              {questionTypes?.[index]?.type === 'select' && (
                <Field label="Options (comma separated)" error={errors.questions?.[index]?.options?.message}>
                  <input
                    className="input"
                    placeholder="S, M, L, XL"
                    {...register(`questions.${index}.options`, {
                      validate: (v) => (v ?? '').split(',').filter((o) => o.trim()).length >= 2 || 'Give at least 2 options',
                    })}
                  />
                </Field>
              )}
              <label className="checkbox">
                <input type="checkbox" {...register(`questions.${index}.required`)} /> Required
              </label>
              {!questionsLocked && (
                <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                  Remove
                </Button>
              )}
            </fieldset>
          ))}
        </Card.Body>
        <Card.Footer>
          <Button type="submit" loading={isSubmitting} disabled={isEdit && !isDirty}>
            {isEdit ? 'Save changes' : 'Save draft'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate('/organiser')}>
            Cancel
          </Button>
        </Card.Footer>
      </Card>
    </form>
  );
}
