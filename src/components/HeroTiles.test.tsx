import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeroTiles } from './HeroTiles';
import type { ChangeEvent, EventType } from '../lib/types';

const event = (type: EventType, id: string): ChangeEvent => ({
  ts: '2026-08-06T17:00:00.000Z',
  type,
  id,
  source: 'm365',
  title: 'Feature',
  link: '',
  products: [],
  from: null,
  to: null,
  fromRaw: null,
  toRaw: null,
  months: null,
  days: null,
});

const events = [
  event('slipped', '1'),
  event('slipped', '2'),
  event('shipped', '3'),
];

describe('HeroTiles', () => {
  it('counts each type', () => {
    render(<HeroTiles events={events} selected={[]} onToggle={vi.fn()} />);
    expect(screen.getByText('Slipped').previousSibling).toHaveTextContent('2');
    expect(screen.getByText('Shipped').previousSibling).toHaveTextContent('1');
  });

  it('omits types with no events rather than showing zeros', () => {
    render(<HeroTiles events={events} selected={[]} onToggle={vi.fn()} />);
    expect(screen.queryByText('Dropped')).not.toBeInTheDocument();
  });

  it('leads with the interesting movements', () => {
    render(<HeroTiles events={events} selected={[]} onToggle={vi.fn()} />);
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels[0]).toContain('Slipped');
  });

  it('filters when a tile is clicked', async () => {
    const onToggle = vi.fn();
    render(<HeroTiles events={events} selected={[]} onToggle={onToggle} />);
    await userEvent.click(screen.getByText('Slipped'));
    expect(onToggle).toHaveBeenCalledWith('slipped');
  });

  it('marks the selected tile as pressed', () => {
    render(<HeroTiles events={events} selected={['slipped']} onToggle={vi.fn()} />);
    expect(screen.getByText('Slipped').closest('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders nothing when there are no events', () => {
    const { container } = render(<HeroTiles events={[]} selected={[]} onToggle={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
