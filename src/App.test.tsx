import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { ChangeEvent, DataIndex, Timeline } from './lib/types';

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

const index: DataIndex = {
  generated: new Date().toISOString(),
  recentDays: 90,
  months: ['2026-08'],
  sources: {
    m365: { count: 1814, fetched: '2026-08-06T17:00:00.000Z', ok: true },
    azure: { count: 10, fetched: '2026-08-06T17:00:00.000Z', ok: true },
  },
  totals: { recent: 2, recentByType: { slipped: 1, shipped: 1 } },
  warnings: [],
};

const timelines: Record<string, Timeline> = {
  'm365:1': {
    title: 'Planner refresh',
    link: 'https://example.test/1',
    source: 'm365',
    products: ['Planner'],
    points: [{ ts: '2026-08-06T17:00:00.000Z', type: 'slipped', from: '2026-09', to: '2026-12' }],
  },
};

/** Serve the three data-branch files; anything else is a 404. */
function mockData({
  events = [event(), event({ id: 'm365:2', type: 'shipped', title: 'Teams notes', months: null })],
  dataIndex = index,
  failures = [] as string[],
} = {}) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const name = String(url).split('/').pop() ?? '';
    if (failures.includes(name)) {
      return Promise.resolve({ ok: false, status: 404 } as Response);
    }
    const body =
      name === 'index.json' ? dataIndex
      : name === 'recent.json' ? events
      : name === 'timelines.json' ? timelines
      : null;
    if (body === null) return Promise.resolve({ ok: false, status: 404 } as Response);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
  }));
}

beforeEach(() => {
  window.location.hash = '';
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('shows a loading state, then the feed', async () => {
    mockData();
    render(<App />);
    expect(screen.getByLabelText(/loading changes/i)).toBeInTheDocument();
    expect(await screen.findByText('Planner refresh')).toBeInTheDocument();
  });

  it('leads with the counts of what moved', async () => {
    mockData();
    render(<App />);
    const tiles = within(await screen.findByRole('group', { name: /change summary/i }));
    expect(tiles.getByText('Slipped').previousSibling).toHaveTextContent('1');
    expect(tiles.getByText('Shipped').previousSibling).toHaveTextContent('1');
  });

  it('filters the feed when a tile is clicked, and says so in the URL', async () => {
    mockData();
    render(<App />);
    await screen.findByText('Planner refresh');

    const tiles = within(screen.getByRole('group', { name: /change summary/i }));
    await userEvent.click(tiles.getByText('Slipped'));

    await waitFor(() => expect(screen.queryByText('Teams notes')).not.toBeInTheDocument());
    expect(screen.getByText('Planner refresh')).toBeInTheDocument();
    expect(window.location.hash).toContain('type=slipped');
  });

  it('restores filters from the URL on load', async () => {
    window.location.hash = '#/?q=teams';
    mockData();
    render(<App />);
    expect(await screen.findByText('Teams notes')).toBeInTheDocument();
    expect(screen.queryByText('Planner refresh')).not.toBeInTheDocument();
  });

  it('opens an item history and comes back', async () => {
    mockData();
    render(<App />);
    await userEvent.click(await screen.findByText('Planner refresh'));

    expect(await screen.findByText(/1 recorded change/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /back to the feed/i }));
    expect(await screen.findByText('Teams notes')).toBeInTheDocument();
  });

  it('reports a failure to load rather than showing an empty feed', async () => {
    mockData({ failures: ['index.json'] });
    render(<App />);
    expect(await screen.findByText(/could not load the change history/i)).toBeInTheDocument();
  });

  it('still renders when only the timelines are missing', async () => {
    mockData({ failures: ['timelines.json'] });
    render(<App />);
    expect(await screen.findByText('Planner refresh')).toBeInTheDocument();
  });

  it('explains the empty state on a freshly seeded repository', async () => {
    mockData({ events: [] });
    render(<App />);
    expect(await screen.findByText(/nothing has moved yet/i)).toBeInTheDocument();
    expect(screen.getByText(/1824 tracked items/)).toBeInTheDocument();
  });

  it('surfaces pipeline warnings', async () => {
    mockData({ dataIndex: { ...index, warnings: ['azure: fetch failed — HTTP 503'] } });
    render(<App />);
    expect(await screen.findByText(/azure: fetch failed/i)).toBeInTheDocument();
  });

  it('toggles the theme and remembers the choice', async () => {
    mockData();
    render(<App />);
    const toggle = await screen.findByRole('button', { name: /switch to .* theme/i });
    const before = document.documentElement.dataset.theme;

    await userEvent.click(toggle);

    expect(document.documentElement.dataset.theme).not.toBe(before);
    expect(localStorage.getItem('ship-or-slip:theme')).toBe(document.documentElement.dataset.theme);
  });
});
