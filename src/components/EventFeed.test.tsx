import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventFeed, groupByDay } from './EventFeed';
import type { ChangeEvent } from '../lib/types';

const event = (overrides: Partial<ChangeEvent> = {}): ChangeEvent => ({
  ts: '2026-08-06T17:00:00.000Z',
  type: 'slipped',
  id: 'm365:1',
  source: 'm365',
  title: 'Planner refresh',
  link: 'https://example.test/1',
  products: ['Planner'],
  from: '2026-09',
  to: '2026-12',
  fromRaw: 'September CY2026',
  toRaw: 'December CY2026',
  months: 3,
  days: null,
  ...overrides,
});

describe('groupByDay', () => {
  it('groups events sharing a UTC day', () => {
    const groups = groupByDay([event(), event({ id: 'm365:2', ts: '2026-08-06T20:00:00.000Z' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.events).toHaveLength(2);
  });

  it('starts a new group on a new day', () => {
    const groups = groupByDay([event(), event({ id: 'm365:2', ts: '2026-08-05T20:00:00.000Z' })]);
    expect(groups.map((g) => g.day)).toEqual(['2026-08-06', '2026-08-05']);
  });

  it('handles an empty list', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('EventFeed', () => {
  it('shows the title, the move and the magnitude', () => {
    render(<EventFeed events={[event()]} onOpen={vi.fn()} />);
    expect(screen.getByText('Planner refresh')).toBeInTheDocument();
    expect(screen.getByText(/September 2026/)).toBeInTheDocument();
    expect(screen.getByText(/December 2026/)).toBeInTheDocument();
    expect(screen.getByText('+3 months')).toBeInTheDocument();
  });

  it('labels the change type in words, not only by colour', () => {
    render(<EventFeed events={[event()]} onOpen={vi.fn()} />);
    expect(screen.getByText('Slipped')).toBeInTheDocument();
  });

  it('renders a day heading when grouped', () => {
    render(<EventFeed events={[event()]} onOpen={vi.fn()} />);
    expect(screen.getByText('6 Aug 2026')).toBeInTheDocument();
  });

  it('drops the day headings when ranking by magnitude', () => {
    render(<EventFeed events={[event()]} onOpen={vi.fn()} grouped={false} />);
    expect(screen.queryByText('6 Aug 2026')).not.toBeInTheDocument();
  });

  it('opens the item when a row is clicked', async () => {
    const onOpen = vi.fn();
    render(<EventFeed events={[event()]} onOpen={onOpen} />);
    await userEvent.click(screen.getByText('Planner refresh'));
    expect(onOpen).toHaveBeenCalledWith('m365:1');
  });

  it('omits the magnitude for a status-only change', () => {
    render(<EventFeed events={[event({ type: 'shipped', months: null, from: null, to: null })]} onOpen={vi.fn()} />);
    expect(screen.getByText('Shipped')).toBeInTheDocument();
    expect(screen.queryByText(/months/)).not.toBeInTheDocument();
  });

  it('shows the previous title on a rename, not two titles round an arrow', () => {
    render(
      <EventFeed
        events={[event({
          type: 'renamed',
          title: 'Planner: refresh for Web',
          from: 'Planner: refresh for Web, Desktop and Mobile',
          to: 'Planner: refresh for Web',
          months: null,
        })]}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText('Planner: refresh for Web')).toBeInTheDocument();
    expect(screen.getByText(/was .Planner: refresh for Web, Desktop and Mobile./)).toBeInTheDocument();
    expect(screen.queryByText('→')).not.toBeInTheDocument();
  });

  it('labels a preview slip distinctly from a GA slip', () => {
    render(
      <EventFeed
        events={[event({ type: 'preview_slipped', from: '2026-06', to: '2026-08', months: 2 })]}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText('Preview slipped')).toBeInTheDocument();
    expect(screen.getByText('+2 months')).toBeInTheDocument();
  });

  it('leads a scope cut with what was lost', () => {
    render(
      <EventFeed
        events={[event({
          type: 'scope_reduced',
          dimension: 'clouds',
          from: 'Worldwide, GCC High',
          to: 'Worldwide',
          fromRaw: 'Clouds lost: GCC High',
          months: null,
        })]}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText('Scope cut')).toBeInTheDocument();
    expect(screen.getByText('Clouds lost: GCC High')).toBeInTheDocument();
    expect(screen.getByText(/Worldwide, GCC High/)).toBeInTheDocument();
  });

  it('labels a widened scope distinctly', () => {
    render(
      <EventFeed
        events={[event({
          type: 'scope_expanded',
          dimension: 'platforms',
          from: 'Web',
          to: 'Web, Mac',
          fromRaw: 'Platforms gained: Mac',
          months: null,
        })]}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText('Scope widened')).toBeInTheDocument();
    expect(screen.getByText('Platforms gained: Mac')).toBeInTheDocument();
  });

  it('explains an empty result rather than showing a blank page', () => {
    render(<EventFeed events={[]} onOpen={vi.fn()} />);
    expect(screen.getByText(/nothing matches those filters/i)).toBeInTheDocument();
  });

  it('keeps two changes to the same item distinct', () => {
    render(
      <EventFeed
        events={[event(), event({ type: 'shipped', months: null })]}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getAllByText('Planner refresh')).toHaveLength(2);
  });
});
