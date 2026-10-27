// [FULLSTACK M1.6 + M2.6-M2.9] My tasks: validation before sending, create, optimistic tick with rollback,
// delete, and a server validation error shown under the edited field.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/apiClient.js';
import { tasksApi } from '../../services/tasksApi.js';
import { deferred, ok, renderWithProviders } from '../../test/utils.jsx';
import TasksPage from './TasksPage.jsx';

vi.mock('../../services/tasksApi.js', () => ({ tasksApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } }));
vi.mock('../../services/catalogApi.js', () => ({
  catalogApi: { me: vi.fn().mockResolvedValue({ data: { id: 11, name: 'Priya Singh', role: 'STUDENT', clubs: [] } }) },
}));

const task = (id, title, completed = false) => ({
  id,
  title,
  notes: null,
  dueDate: null,
  completed,
  completedAt: completed ? new Date().toISOString() : null,
  createdAt: new Date().toISOString(),
});
const tabCount = (name) => within(screen.getByRole('tab', { name: new RegExp(name, 'i') })).getByText(/\d+/).textContent;

beforeEach(() => {
  vi.clearAllMocks();
  tasksApi.list.mockResolvedValue(ok([task(1, 'Print my resume'), task(2, 'Submit report', true)], { total: 2, open: 1, done: 1 }));
});

describe('TasksPage', () => {
  it('FS-T28 lists my tasks with To do / Done counts', async () => {
    renderWithProviders(<TasksPage />, { userId: 11 });
    expect(await screen.findByText('Print my resume')).toBeInTheDocument();
    expect(screen.getByText('Submit report')).toBeInTheDocument();
    expect(tabCount('To do')).toBe('1');
    expect(tabCount('Done')).toBe('1');
  });

  it('FS-T29 checks the title before sending, then creates the task and refreshes the list', async () => {
    const user = userEvent.setup();
    tasksApi.create.mockResolvedValue(ok(task(3, 'Buy notebook')));
    renderWithProviders(<TasksPage />, { userId: 11 });
    await screen.findByText('Print my resume');
    const form = screen.getByRole('form', { name: 'Add a task' });

    await user.click(within(form).getByRole('button', { name: /add task/i }));
    expect(await within(form).findByText('Title is required')).toBeInTheDocument();
    expect(tasksApi.create).not.toHaveBeenCalled();

    await user.type(within(form).getByLabelText('Title'), 'Buy notebook');
    await user.click(within(form).getByRole('button', { name: /add task/i }));
    await waitFor(() => expect(tasksApi.create).toHaveBeenCalledWith({ title: 'Buy notebook', notes: '', dueDate: null }));
    await waitFor(() => expect(tasksApi.list).toHaveBeenCalledTimes(2)); // invalidated, so refetched
  });

  it('FS-T30 ticking a task done is optimistic and rolls back when the server refuses', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    tasksApi.update.mockReturnValue(pending.promise);
    renderWithProviders(<TasksPage />, { userId: 11 });

    const checkbox = await screen.findByRole('checkbox', { name: 'Mark "Print my resume" as done' });
    await user.click(checkbox);
    expect(checkbox).toBeChecked(); // before the server answered
    expect(tasksApi.update).toHaveBeenCalledWith(1, { completed: true });

    pending.reject(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Mark "Print my resume" as done' })).not.toBeChecked());
  });

  it('FS-T31 deletes a task and refreshes the list', async () => {
    const user = userEvent.setup();
    tasksApi.remove.mockResolvedValue(null);
    renderWithProviders(<TasksPage />, { userId: 11 });
    const row = (await screen.findByText('Print my resume')).closest('li');
    tasksApi.list.mockResolvedValue(ok([task(2, 'Submit report', true)], { total: 1, open: 0, done: 1 }));

    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(tasksApi.remove).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText('Print my resume')).not.toBeInTheDocument());
    expect(screen.getByText('Task deleted')).toBeInTheDocument();
  });

  it('FS-T32 edits a task; a server validation error appears under the field', async () => {
    const user = userEvent.setup();
    tasksApi.update.mockRejectedValue(
      new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fieldErrors: { title: 'Title must be at most 120 characters' } }),
    );
    renderWithProviders(<TasksPage />, { userId: 11 });
    const row = (await screen.findByText('Print my resume')).closest('li');
    await user.click(within(row).getByRole('button', { name: 'Edit' }));

    const form = screen.getByRole('form', { name: 'Edit "Print my resume"' });
    const title = within(form).getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Print my resume (two copies)');
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    expect(await within(form).findByText('Title must be at most 120 characters')).toBeInTheDocument();
    expect(tasksApi.update).toHaveBeenCalledWith(1, { title: 'Print my resume (two copies)', notes: '', dueDate: null });
  });
});
