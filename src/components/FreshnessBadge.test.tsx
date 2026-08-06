import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FreshnessBadge, gradeFreshness } from './FreshnessBadge';

const now = new Date('2026-08-06T18:00:00Z');

describe('gradeFreshness', () => {
  it('is ok inside the six-hour schedule', () => {
    expect(gradeFreshness('2026-08-06T15:00:00Z', false, now)).toBe('ok');
  });

  it('warns once a run has clearly been missed', () => {
    expect(gradeFreshness('2026-08-06T07:00:00Z', false, now)).toBe('warn');
  });

  it('goes bad after several missed runs', () => {
    expect(gradeFreshness('2026-08-05T18:00:00Z', false, now)).toBe('bad');
  });

  it('warns on a pipeline warning even when the run is fresh', () => {
    expect(gradeFreshness('2026-08-06T17:55:00Z', true, now)).toBe('warn');
  });

  it('is bad when there is no run at all', () => {
    expect(gradeFreshness(null, false, now)).toBe('bad');
    expect(gradeFreshness('nonsense', false, now)).toBe('bad');
  });
});

describe('FreshnessBadge', () => {
  it('states the age in words', () => {
    render(<FreshnessBadge generated={new Date().toISOString()} warnings={[]} />);
    expect(screen.getByText(/updated just now/i)).toBeInTheDocument();
  });

  it('says so plainly when the pipeline has never run', () => {
    render(<FreshnessBadge generated={null} warnings={[]} />);
    expect(screen.getByText(/no data yet/i)).toBeInTheDocument();
  });

  it('carries the verdict in text, not only in colour', () => {
    const { container } = render(<FreshnessBadge generated={null} warnings={[]} />);
    expect(container.querySelector('.freshness--bad')).toBeTruthy();
    expect(screen.getByText(/no data yet/i)).toBeVisible();
  });
});
