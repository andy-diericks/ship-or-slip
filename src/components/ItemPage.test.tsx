import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemPage } from './ItemPage';
import type { Timeline } from '../lib/types';

const timeline: Timeline = {
  title: 'Planner: Refreshed experience',
  link: 'https://example.test/1',
  source: 'm365',
  products: ['Planner'],
  points: [
    { ts: '2026-06-01T00:00:00.000Z', type: 'slipped', from: '2026-06', to: '2026-09' },
    { ts: '2026-07-01T00:00:00.000Z', type: 'slipped', from: '2026-09', to: '2026-12' },
  ],
};

describe('ItemPage', () => {
  it('shows every recorded change for the item', () => {
    render(<ItemPage id="m365:1" timeline={timeline} onBack={vi.fn()} />);
    expect(screen.getByText(/2 recorded changes/i)).toBeInTheDocument();
    expect(screen.getAllByText('Slipped')).toHaveLength(2);
  });

  it('lists the newest change first', () => {
    render(<ItemPage id="m365:1" timeline={timeline} onBack={vi.fn()} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('1 Jul 2026');
  });

  it('derives the Microsoft link from the id, not from the stored link', () => {
    // The stored link is deliberately a stale, wrong URL here: archived events
    // captured one under an older rule, and deriving is what repairs them.
    render(<ItemPage id="m365:558683" timeline={timeline} onBack={vi.fn()} />);
    expect(screen.getByRole('link', { name: /microsoft/i })).toHaveAttribute(
      'href',
      'https://www.microsoft.com/microsoft-365/roadmap?searchterms=558683',
    );
  });

  it('shows the roadmap id, so it can be looked up on Microsoft\'s own site', () => {
    render(<ItemPage id="m365:558683" timeline={timeline} onBack={vi.fn()} />);
    expect(screen.getByText(/Roadmap ID 558683/)).toBeInTheDocument();
  });

  it('calls it an Update ID for Azure items', () => {
    render(
      <ItemPage id="azure:567979" timeline={{ ...timeline, source: 'azure' }} onBack={vi.fn()} />,
    );
    expect(screen.getByText(/Update ID 567979/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /microsoft/i })).toHaveAttribute(
      'href',
      'https://azure.microsoft.com/updates?id=567979',
    );
  });

  it('explains why an unchanged item has no history', () => {
    render(<ItemPage id="m365:999" timeline={undefined} onBack={vi.fn()} />);
    expect(screen.getByText(/no history recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/has not moved since then/i)).toBeInTheDocument();
  });

  it('goes back to the feed', async () => {
    const onBack = vi.fn();
    render(<ItemPage id="m365:1" timeline={timeline} onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: /back to the feed/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it('uses the singular for a single change', () => {
    render(
      <ItemPage
        id="m365:1"
        timeline={{ ...timeline, points: timeline.points.slice(0, 1) }}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText(/1 recorded change$/i)).toBeInTheDocument();
  });
});
