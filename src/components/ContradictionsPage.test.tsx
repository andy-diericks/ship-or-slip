import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContradictionsPage } from './ContradictionsPage';
import type { ContradictionRegister } from '../lib/types';

vi.mock('../lib/data', () => ({ loadContradictions: vi.fn() }));
const { loadContradictions } = await import('../lib/data');

const item = (id: string, kind: ContradictionRegister['items'][0]['kind'], title: string) => ({
  id,
  title,
  source: 'm365' as const,
  products: ['Microsoft Teams'],
  kind,
  claim: 'Roadmap status: Launched',
  evidence: 'but its own rollout date is in the future',
  note: null,
});

const register: ContradictionRegister = {
  generated: '2026-08-20T05:00:00.000Z',
  month: '2026-08',
  summary: {
    count: 5,
    byKind: { launched_future: 1, launched_unshipped: 3, rolled_back: 1 },
  },
  items: [
    item('m365:1', 'launched_future', 'Edge contextual nudges'),
    item('m365:2', 'launched_unshipped', 'PowerPoint agent mode'),
    item('m365:3', 'launched_unshipped', 'Teams background blur'),
    item('m365:4', 'launched_unshipped', 'Outlook pinned folders'),
    item('m365:5', 'rolled_back', 'Word citations'),
  ],
};

const tile = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.mocked(loadContradictions).mockResolvedValue(register);
});

const renderPage = async () => {
  render(<ContradictionsPage onBack={vi.fn()} timelines={{}} onOpenItem={vi.fn()} />);
  return screen.findByRole('group', { name: /Filter by contradiction kind/i });
};

describe('ContradictionsPage kind tiles', () => {
  it('shows every row before anything is clicked', async () => {
    await renderPage();
    expect(screen.getByText('Edge contextual nudges')).toBeInTheDocument();
    expect(screen.getByText('Word citations')).toBeInTheDocument();
  });

  it('filters the rows to the kind that was clicked', async () => {
    await renderPage();
    await userEvent.click(tile(/Marked launched, but not shipped/));

    expect(screen.getByText('PowerPoint agent mode')).toBeInTheDocument();
    expect(screen.queryByText('Edge contextual nudges')).not.toBeInTheDocument();
    expect(screen.queryByText('Word citations')).not.toBeInTheDocument();
  });

  it('says on screen that the list is filtered, and by what', async () => {
    // The whole complaint being fixed: a shorter list with nothing explaining
    // why reads as missing data rather than as a filter.
    await renderPage();
    await userEvent.click(tile(/Rolled back after release/));

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Showing 1 of 5');
    expect(status).toHaveTextContent('Rolled back after release');
  });

  it('marks the clicked tile as pressed and leaves the others alone', async () => {
    await renderPage();
    await userEvent.click(tile(/Rolled back after release/));

    expect(tile(/Rolled back after release/)).toHaveAttribute('aria-pressed', 'true');
    expect(tile(/Marked launched, but not shipped/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking the same tile again clears the filter', async () => {
    await renderPage();
    await userEvent.click(tile(/Marked launched, but not shipped/));
    await userEvent.click(tile(/Marked launched, but not shipped/));

    expect(screen.getByText('Word citations')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('selecting another kind replaces the selection rather than adding to it', async () => {
    await renderPage();
    await userEvent.click(tile(/Marked launched, but not shipped/));
    await userEvent.click(tile(/Rolled back after release/));

    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 5');
    expect(screen.getByText('Word citations')).toBeInTheDocument();
    expect(screen.queryByText('PowerPoint agent mode')).not.toBeInTheDocument();
  });

  it('the Clear button restores every row', async () => {
    await renderPage();
    await userEvent.click(tile(/Marked launched, but not shipped/));
    await userEvent.click(screen.getByRole('button', { name: /Clear filters/i }));

    expect(screen.getByText('Edge contextual nudges')).toBeInTheDocument();
    expect(tile(/Marked launched, but not shipped/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the tile counts at their unfiltered totals so they do not renumber', async () => {
    await renderPage();
    await userEvent.click(tile(/Marked launched, but not shipped/));

    const group = screen.getByRole('group', { name: /Filter by contradiction kind/i });
    expect(within(group).getByText('3')).toBeInTheDocument();
    expect(within(group).getAllByText('1')).toHaveLength(2);
  });

  it('shows no status line when nothing is filtered', async () => {
    await renderPage();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
