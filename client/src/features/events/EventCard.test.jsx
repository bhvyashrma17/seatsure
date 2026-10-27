// [FULLSTACK M1.7] Measure first: count how often a card's body actually renders.
import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SeatMeter } from '../../shared/components/SeatMeter.jsx';
import { EventCard } from './EventCard.jsx';

// SeatMeter renders inside every card, so its call count = how many times cards rendered.
vi.mock('../../shared/components/SeatMeter.jsx', () => ({ SeatMeter: vi.fn(() => null) }));

const event = (id, confirmedCount = 2) => ({
  id,
  title: `Event ${id}`,
  category: 'TALK',
  startsAt: '2026-11-01T10:00:00.000Z',
  endsAt: '2026-11-01T12:00:00.000Z',
  capacity: 10,
  confirmedCount,
  isFull: false,
  club: { name: 'Club' },
  venue: { name: 'Lab', building: 'B' },
});

describe('EventCard performance', () => {
  it('FS-T27 React.memo: re-rendering the list re-renders only the card whose data changed', () => {
    let setEvents;
    function List() {
      const [events, set] = useState([event(1), event(2), event(3)]);
      setEvents = set;
      return events.map((e) => <EventCard key={e.id} event={e} />);
    }
    render(
      <MemoryRouter>
        <List />
      </MemoryRouter>,
    );
    expect(SeatMeter).toHaveBeenCalledTimes(3); // first render: 3 cards

    // A poll returns the same objects (structural sharing): no card renders again.
    act(() => setEvents((list) => [...list]));
    expect(SeatMeter).toHaveBeenCalledTimes(3);

    // Someone registers for event 2: only that card renders again.
    act(() => setEvents((list) => list.map((e) => (e.id === 2 ? event(2, 3) : e))));
    expect(SeatMeter).toHaveBeenCalledTimes(4);
  });
});
