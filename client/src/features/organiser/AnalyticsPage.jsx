// Organiser analytics. PostgreSQL window-function reports + MongoDB aggregation reports.
// [FULLSTACK M1.9: Error boundaries] Each report is wrapped in its own boundary: if one chart crashes
// (or its query fails, via throwOnError), only that panel shows a fallback with "Try again".
// The rest of the dashboard keeps working.
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Button } from '../../shared/components/Button.jsx';
import { Card } from '../../shared/components/Card.jsx';
import { ErrorFallback, Spinner } from '../../shared/components/Feedback.jsx';
import { formatDay } from '../../shared/lib/format.js';
import { useAnalyticsActivity, useAnalyticsOverview, useMongoSwitch } from './hooks/useOrganiser.js';

function Panel({ children, resetKeys }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary FallbackComponent={ErrorFallback} onReset={reset} resetKeys={resetKeys}>
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

function SignupsChart({ rows, crash }) {
  if (crash) throw new Error('Simulated chart rendering failure');
  const max = Math.max(1, ...rows.map((r) => r.signups));
  const maxCum = Math.max(1, rows.at(-1)?.cumulative ?? 1);
  const w = 640;
  const h = 180;
  const barW = w / rows.length;
  const line = rows.map((r, i) => `${i * barW + barW / 2},${h - (r.cumulative / maxCum) * (h - 10)}`).join(' ');
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${w} ${h + 24}`} role="img" aria-label="Daily sign-ups with running total">
        {rows.map((r, i) => {
          const bh = (r.signups / max) * (h - 20);
          return (
            <g key={r.day}>
              <rect className="chart__bar" x={i * barW + 3} y={h - bh} width={barW - 6} height={bh} rx="3">
                <title>{`${formatDay(r.day)}: ${r.signups} sign-ups (total ${r.cumulative}, 7-day avg ${r.movingAvg7d})`}</title>
              </rect>
              {i % 3 === 0 && (
                <text className="chart__label" x={i * barW + barW / 2} y={h + 16} textAnchor="middle">
                  {formatDay(r.day)}
                </text>
              )}
            </g>
          );
        })}
        <polyline className="chart__line" points={line} fill="none" />
      </svg>
      <figcaption className="muted small">Bars: sign-ups per day · Line: running total (SUM() OVER (ORDER BY day))</figcaption>
    </figure>
  );
}

function OverviewPanels({ scope, crash }) {
  const { data, isPending } = useAnalyticsOverview(scope);
  if (isPending) return <Spinner label="Crunching numbers" />;
  return (
    <>
      <Card>
        <Card.Header title="Sign-ups, last 21 days" eyebrow="PostgreSQL · CTE + window functions" />
        <Card.Body>
          <Panel resetKeys={[crash]}>
            <SignupsChart rows={data.dailySignups} crash={crash} />
          </Panel>
        </Card.Body>
      </Card>
      <div className="layout-2col">
        <Card>
          <Card.Header title="Fill-rate ranking" eyebrow="RANK() OVER (...)" />
          <Card.Body>
            <table className="table table--compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Event</th>
                  <th>Fill</th>
                  <th>Waitlist</th>
                  <th title="Fill rate compared with the club average">vs club</th>
                </tr>
              </thead>
              <tbody>
                {data.fillRates.map((r) => (
                  <tr key={r.id}>
                    <td>{r.overallRank}</td>
                    <td>
                      {r.title}
                      <div className="muted small">
                        {r.clubName} · #{r.rankInClub} in club
                      </div>
                    </td>
                    <td>{r.fillRate}%</td>
                    <td>{r.waitlisted}</td>
                    <td className={r.vsClubAverage >= 0 ? 'positive' : 'negative'}>
                      {r.vsClubAverage > 0 ? '+' : ''}
                      {r.vsClubAverage}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card.Body>
        </Card>
        <Card>
          <Card.Header title="Club leaderboard" eyebrow="DENSE_RANK() + NTILE(3)" />
          <Card.Body>
            <table className="table table--compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Club</th>
                  <th>Fill</th>
                  <th>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {data.clubLeaderboard.map((c) => (
                  <tr key={c.clubId}>
                    <td>{c.rank}</td>
                    <td>
                      {c.clubName} <span className={`tier tier--${c.tier}`}>{['', 'Top', 'Mid', 'Low'][c.tier]}</span>
                    </td>
                    <td>{c.fillRate ?? '-'}%</td>
                    <td>{c.attendanceRate === null ? '-' : `${c.attendanceRate}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card.Body>
        </Card>
      </div>
    </>
  );
}

function ActivityPanel({ scope }) {
  const { data, isPending } = useAnalyticsActivity(scope);
  if (isPending) return <Spinner label="Loading activity" />;
  if (data.degraded) {
    return (
      <Card>
        <Card.Header title="Activity (last 14 days)" eyebrow="MongoDB aggregation" />
        <Card.Body>
          <p className="notice notice--warning">{data.reason}. Everything stored in PostgreSQL above is unaffected.</p>
        </Card.Body>
      </Card>
    );
  }
  const { summary, promotions } = data;
  const maxAction = Math.max(1, ...summary.byAction.map((a) => a.count));
  return (
    <div className="layout-2col">
      <Card>
        <Card.Header title="Activity (last 14 days)" eyebrow="MongoDB · $match → $facet" />
        <Card.Body>
          <p className="stat">
            {summary.totals.activities} <span className="muted small">actions across {summary.totals.uniqueEvents} events</span>
          </p>
          <ul className="bars">
            {summary.byAction.map((a) => (
              <li key={a.action}>
                <span className="bars__label">{a.action.toLowerCase().replace('_', ' ')}</span>
                <span className="bars__track">
                  <span className="bars__fill" style={{ width: `${(a.count / maxAction) * 100}%` }} />
                </span>
                <span className="bars__value">{a.count}</span>
              </li>
            ))}
          </ul>
        </Card.Body>
      </Card>
      <Card>
        <Card.Header title="Waitlist promotions" eyebrow="MongoDB · $lookup into notifications" />
        <Card.Body>
          {promotions.length === 0 ? (
            <p className="muted">No promotions yet.</p>
          ) : (
            <table className="table table--compact">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Promoted</th>
                  <th>Unread notices</th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((p) => (
                  <tr key={p.eventId}>
                    <td>{p.title}</td>
                    <td>{p.promotions}</td>
                    <td>
                      {p.unread} / {p.notified}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}

function ReliabilityPanel() {
  const { outage, restore, health } = useMongoSwitch();
  const h = health.data;
  return (
    <Card className="dev-panel">
      <Card.Header title="Reliability demo (development only)" eyebrow="Graceful degradation" />
      <Card.Body>
        <p className="small">
          PostgreSQL: <strong>{h?.postgres ?? '…'}</strong> · MongoDB: <strong>{h?.mongo ?? '…'}</strong> · Outbox pending: <strong>{h?.outbox?.pending ?? '…'}</strong>
        </p>
        <p className="muted small">Take MongoDB down, then register for an event: it still works, the feed shows "unavailable", and messages wait in the outbox until MongoDB is back.</p>
      </Card.Body>
      <Card.Footer>
        <Button size="sm" variant="danger" onClick={() => outage.mutate()} loading={outage.isPending} disabled={h?.mongo !== 'up'}>
          Simulate MongoDB outage
        </Button>
        <Button size="sm" variant="secondary" onClick={() => restore.mutate()} loading={restore.isPending} disabled={h?.mongo === 'up'}>
          Restore MongoDB
        </Button>
      </Card.Footer>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [scope, setScope] = useState('mine');
  const [crash, setCrash] = useState(false);
  return (
    <div className="stack">
      <div className="toolbar toolbar--spread">
        <div className="segmented" role="group" aria-label="Scope">
          <button className={scope === 'mine' ? 'is-active' : ''} onClick={() => setScope('mine')}>
            My clubs
          </button>
          <button className={scope === 'all' ? 'is-active' : ''} onClick={() => setScope('all')}>
            Whole campus
          </button>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setCrash((c) => !c)}>
          {crash ? 'Fix the chart' : 'Simulate a chart crash'}
        </Button>
      </div>
      <Panel resetKeys={[scope]}>
        <OverviewPanels scope={scope} crash={crash} />
      </Panel>
      <Panel resetKeys={[scope]}>
        <ActivityPanel scope={scope} />
      </Panel>
      {import.meta.env.DEV && <ReliabilityPanel />}
    </div>
  );
}
