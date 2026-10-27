// "My tasks": a personal to-do list that shows CRUD over REST end to end. Create (POST), read (GET),
// update or tick done (PATCH, optimistic) and delete (DELETE) /api/v1/tasks.
// [FULLSTACK M1.6 + M2.9: React Hook Form + mutation] The title is checked before sending; server
// validation errors (400) are shown under the matching field.
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button } from '../../shared/components/Button.jsx';
import { Card } from '../../shared/components/Card.jsx';
import { EmptyState, ErrorState, Spinner } from '../../shared/components/Feedback.jsx';
import { Field } from '../../shared/components/Field.jsx';
import { useToast } from '../../shared/components/Toast.jsx';
import { toFormField } from '../../shared/lib/format.js';
import { useCurrentUser } from '../users/index.js';
import { TaskItem } from './TaskItem.jsx';
import { useCreateTask, useDeleteTask, useTasks, useUpdateTask } from './hooks/useTasks.js';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'To do' },
  { id: 'done', label: 'Done' },
];

export default function TasksPage() {
  const { user, userId } = useCurrentUser();
  const toast = useToast();
  const { data, error, isPending, refetch } = useTasks();
  const create = useCreateTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [tab, setTab] = useState('all');
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ mode: 'onTouched', defaultValues: { title: '', notes: '', dueDate: '' } });

  const groups = useMemo(() => {
    const all = data?.data ?? [];
    return { all, open: all.filter((t) => !t.completed), done: all.filter((t) => t.completed) };
  }, [data]);

  async function onCreate(values) {
    try {
      await create.mutateAsync({ title: values.title, notes: values.notes, dueDate: values.dueDate || null });
      toast.show('Task added', { tone: 'success' });
      reset();
    } catch (err) {
      const fields = Object.entries(err.fieldErrors ?? {});
      if (fields.length) for (const [field, message] of fields) setError(toFormField(field), { type: 'server', message });
      else toast.show(err.message, { tone: 'error' });
    }
  }

  function onToggle(task) {
    update.mutate(
      { id: task.id, changes: { completed: !task.completed } },
      { onError: (err) => toast.show(`Could not update the task: ${err.message}`, { tone: 'error' }) },
    );
  }

  async function onSave(task, changes) {
    try {
      await update.mutateAsync({ id: task.id, changes });
      toast.show('Changes saved', { tone: 'success' });
    } catch (err) {
      if (!Object.keys(err.fieldErrors ?? {}).length) toast.show(err.message, { tone: 'error' });
      throw err;
    }
  }

  function onDelete(task) {
    remove.mutate(task.id, {
      onSuccess: () => toast.show('Task deleted', { tone: 'info' }),
      onError: (err) => toast.show(err.message, { tone: 'error' }),
    });
  }

  if (!userId) {
    return (
      <section className="page">
        <EmptyState
          title="Choose a demo user to see your tasks"
          action={
            <Link className="btn btn--primary btn--sm" to="/choose-user?next=/me/tasks">
              Choose user
            </Link>
          }
        />
      </section>
    );
  }

  const list = groups[tab];
  return (
    <section className="page">
      <header className="page__header">
        <div>
          <h1>My tasks</h1>
          <p className="lead">{user ? `${user.name}'s to-do list` : 'Your to-do list'}</p>
        </div>
      </header>

      <Card>
        <Card.Header title="Add a task" />
        <form onSubmit={handleSubmit(onCreate)} noValidate aria-label="Add a task">
          <Card.Body className="form-grid">
            <Field label="Title" error={errors.title?.message}>
              <input
                className="input"
                placeholder="e.g. Buy notebook"
                {...register('title', {
                  validate: (v) => v.trim().length > 0 || 'Title is required',
                  maxLength: { value: 120, message: 'At most 120 characters' },
                })}
              />
            </Field>
            <Field label="Due date (optional)" error={errors.dueDate?.message}>
              <input className="input" type="date" {...register('dueDate')} />
            </Field>
            <div className="form-grid__full">
              <Field label="Notes (optional)" error={errors.notes?.message}>
                <input className="input" {...register('notes', { maxLength: { value: 500, message: 'At most 500 characters' } })} />
              </Field>
            </div>
          </Card.Body>
          <Card.Footer>
            <Button type="submit" loading={isSubmitting}>
              Add task
            </Button>
          </Card.Footer>
        </form>
      </Card>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'tab--active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label} <span className="tab__count">{groups[t.id].length}</span>
          </button>
        ))}
      </div>

      {isPending ? (
        <Spinner label="Loading your tasks" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : list.length === 0 ? (
        <EmptyState title={tab === 'done' ? 'No finished tasks yet' : 'Nothing to do here'} />
      ) : (
        <ul className="task-list">
          {list.map((task) => (
            <TaskItem key={task.id} task={task} onToggle={onToggle} onSave={onSave} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </section>
  );
}
