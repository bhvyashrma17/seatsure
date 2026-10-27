// One task in the list: tick it done (PATCH completed), edit it in place (PATCH title/notes/dueDate) or
// delete it (DELETE). Server validation errors (400) are shown under the matching field ([FULLSTACK M2.9]).
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../../shared/components/Button.jsx';
import { Field } from '../../shared/components/Field.jsx';
import { formatDateTime, formatDay, toFormField } from '../../shared/lib/format.js';

const toFormValues = (task) => ({ title: task.title, notes: task.notes ?? '', dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '' });

export function TaskItem({ task, onToggle, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ mode: 'onTouched', defaultValues: toFormValues(task) });

  function startEdit() {
    reset(toFormValues(task));
    setEditing(true);
  }

  async function save(values) {
    try {
      await onSave(task, { title: values.title, notes: values.notes, dueDate: values.dueDate || null });
      setEditing(false);
    } catch (err) {
      for (const [field, message] of Object.entries(err.fieldErrors ?? {})) setError(toFormField(field), { type: 'server', message });
    }
  }

  if (editing) {
    return (
      <li className="task task--editing">
        <form className="task__form" onSubmit={handleSubmit(save)} noValidate aria-label={`Edit "${task.title}"`}>
          <Field label="Title" error={errors.title?.message}>
            <input
              className="input"
              {...register('title', {
                validate: (v) => v.trim().length > 0 || 'Title is required',
                maxLength: { value: 120, message: 'At most 120 characters' },
              })}
            />
          </Field>
          <Field label="Due date" error={errors.dueDate?.message}>
            <input className="input" type="date" {...register('dueDate')} />
          </Field>
          <div className="task__wide">
            <Field label="Notes" error={errors.notes?.message}>
              <input className="input" {...register('notes', { maxLength: { value: 500, message: 'At most 500 characters' } })} />
            </Field>
          </div>
          <div className="task__actions task__wide">
            <Button size="sm" type="submit" loading={isSubmitting}>
              Save
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={`task ${task.completed ? 'task--done' : ''}`}>
      <input
        className="task__check"
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggle(task)}
        aria-label={task.completed ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      />
      <div className="task__body">
        <p className="task__title">{task.title}</p>
        {task.notes && <p className="task__notes muted small">{task.notes}</p>}
        <p className="task__meta muted small">
          {task.dueDate ? `Due ${formatDay(task.dueDate)}` : 'No due date'}
          {task.completed && task.completedAt ? ` · done ${formatDateTime(task.completedAt)}` : ''}
        </p>
      </div>
      <div className="task__actions">
        <Button size="sm" variant="ghost" onClick={startEdit}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDelete(task)}>
          Delete
        </Button>
      </div>
    </li>
  );
}
