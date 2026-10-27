import { Link } from 'react-router-dom';
import { useNotifications } from './hooks/useNotifications.js';

export function NotificationBell() {
  const { data } = useNotifications();
  const unread = data?.meta?.unread ?? 0;
  return (
    <Link to="/me/notifications" className="bell" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" fill="currentColor" />
      </svg>
      {unread > 0 && <span className="bell__count">{unread > 99 ? '99+' : unread}</span>}
    </Link>
  );
}
