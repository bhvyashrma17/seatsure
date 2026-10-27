import { useCurrentUser } from './CurrentUserContext.jsx';
import { useDemoUsers } from './useDemoUsers.js';

export function UserSwitcher() {
  const { userId, setUserId } = useCurrentUser();
  const { data: users = [] } = useDemoUsers();
  const organisers = users.filter((u) => u.role === 'ORGANISER');
  const students = users.filter((u) => u.role === 'STUDENT');
  // Demo personas used in the walkthrough are listed first.
  const suggested = [students.find((u) => u.name === 'Priya Singh'), organisers.find((u) => u.name === 'Aarav Mehta')].filter(Boolean);

  return (
    <label className="user-switcher">
      <span className="visually-hidden">Acting as</span>
      <select value={userId ?? ''} onChange={(e) => setUserId(e.target.value || null)} aria-label="Acting as demo user">
        <option value="">Choose a demo user…</option>
        {suggested.length > 0 && (
          <optgroup label="Demo personas">
            {suggested.map((u) => (
              <option key={`s-${u.id}`} value={u.id}>
                {u.name} ({u.role === 'ORGANISER' ? 'organiser' : 'student'})
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Organisers">
          {organisers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} (organiser)
            </option>
          ))}
        </optgroup>
        <optgroup label="Students">
          {students.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}
