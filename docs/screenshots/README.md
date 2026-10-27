# Screenshots

Taken from the running application: React on :5173, the API on :4000, PostgreSQL and MongoDB. They were captured with headless Chrome at 1280×860 (phone shots at 390 px).

## By CRUD operation

| Operation | What it shows | API request behind it | File |
|---|---|---|---|
| **Read** | Catalogue of upcoming events with live seat meters | `GET /api/v1/events` | `01-catalogue.png` |
| **Read** | Catalogue filtered by category and availability | `GET /api/v1/events?category=WORKSHOP&availability=open` | `02-catalogue-filtered.png` |
| **Read** | One event with its registration form | `GET /api/v1/events/:id` | `03-event-detail-open.png` |
| **Create** | Organiser saves a new event draft (toast: draft created) | `POST /api/v1/events` | `18-create-event-draft.png` |
| **Create** | Student registers for a full event and is placed on the waitlist | `POST /api/v1/events/:id/registrations` | `05-waitlisted-result.png` |
| **Update** | Organiser edits the draft's title and capacity (toast: changes saved) | `PATCH /api/v1/events/:id` | `19-update-event-saved.png` |
| **Update** | Organiser checks an attendee in | `PATCH /api/v1/registrations/:id` | `10c-checked-in.png` |
| **Delete** | Organiser deletes the draft (toast: draft deleted) | `DELETE /api/v1/events/:id` | `20-delete-event-draft.png` |
| **Delete** | Student cancels a registration (toast: registration cancelled) | `DELETE /api/v1/registrations/:id` | `21-cancel-registration.png` |
| **Validation / error** | Event form rejected before sending: title too short, missing venue, dates and description | (no request is sent) | `09-event-form-validation.png` |

## Everything else

| File | What it shows |
|---|---|
| `04-event-full-before.png` | A full event before joining the waitlist |
| `06-my-passes.png` | "My passes": nested registration → event → club, venue data with waitlist positions |
| `07-notifications.png` | Notifications delivered to MongoDB through the outbox |
| `08-organiser-dashboard.png` | Organiser dashboard with offset pagination |
| `10-attendees.png`, `10b-checkin-window-open.png` | Attendee list; check-in window open |
| `11-attendees-jsonb-filter.png` | Attendees filtered by a JSONB answer (GIN index) |
| `12-analytics.png` | Analytics: window-function reports and MongoDB aggregations |
| `13-error-boundary.png` | A crashing chart contained by its own error boundary |
| `14-mongo-outage-notifications.png`, `15-mongo-outage-event-still-works.png` | Simulated MongoDB outage: feeds degrade, registration still works |
| `16-mobile-catalogue.png`, `17-mobile-event-detail.png` | 390 px phone layout |
