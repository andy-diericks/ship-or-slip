import { describe, it, expect } from 'vitest';
import {
  backupDue, backupTag, staleBackups, latestBackup, planBackup,
  BACKUP_KEEP, BACKUP_INTERVAL_DAYS,
} from './backup.mjs';

const NOW = new Date('2026-08-08T12:00:00Z');
const release = (tagName, createdAt) => ({ tagName, createdAt });

describe('backupDue', () => {
  it('is due when nothing has ever been backed up', () => {
    expect(backupDue(null, NOW)).toBe(true);
    expect(backupDue(undefined, NOW)).toBe(true);
    expect(backupDue('', NOW)).toBe(true);
  });

  it('is not due the day after a backup', () => {
    expect(backupDue('2026-08-07T12:00:00Z', NOW)).toBe(false);
  });

  it('is due once the interval has elapsed', () => {
    expect(backupDue('2026-08-01T12:00:00Z', NOW)).toBe(true);
  });

  it('is due exactly on the boundary', () => {
    expect(backupDue('2026-08-01T12:00:00.000Z', NOW)).toBe(true);
    expect(BACKUP_INTERVAL_DAYS).toBe(7);
  });

  it('treats an unparseable date as never backed up, rather than skipping', () => {
    // Failing safe means taking a needless backup, not silently missing one.
    expect(backupDue('not a date', NOW)).toBe(true);
  });

  it('honours a custom interval', () => {
    expect(backupDue('2026-08-06T12:00:00Z', NOW, 1)).toBe(true);
    expect(backupDue('2026-08-06T12:00:00Z', NOW, 30)).toBe(false);
  });
});

describe('backupTag', () => {
  it('is dated, so tags sort chronologically', () => {
    expect(backupTag(NOW)).toBe('backup-2026-08-08');
  });
});

describe('latestBackup', () => {
  it('finds the newest backup release', () => {
    expect(latestBackup([
      release('backup-2026-07-01', '2026-07-01T00:00:00Z'),
      release('backup-2026-08-01', '2026-08-01T00:00:00Z'),
    ])).toBe('2026-08-01T00:00:00Z');
  });

  it('ignores releases that are not backups', () => {
    expect(latestBackup([release('v1.0.0', '2026-08-05T00:00:00Z')])).toBeNull();
  });

  it('handles an empty or missing list', () => {
    expect(latestBackup([])).toBeNull();
    expect(latestBackup(undefined)).toBeNull();
  });
});

describe('staleBackups', () => {
  const many = (n) =>
    Array.from({ length: n }, (_, i) =>
      release(`backup-2026-01-${String(i + 1).padStart(2, '0')}`, `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`));

  it('keeps everything while under the limit', () => {
    expect(staleBackups(many(5))).toEqual([]);
    expect(BACKUP_KEEP).toBe(12);
  });

  it('prunes the oldest once over the limit', () => {
    const stale = staleBackups(many(15));
    expect(stale).toHaveLength(3);
    expect(stale[0]).toBe('backup-2026-01-01');
    expect(stale[2]).toBe('backup-2026-01-03');
  });

  it('NEVER touches a release that is not a backup', () => {
    // Retention deleting a real release would be unforgivable.
    const releases = [...many(15), release('v1.0.0', '2026-01-01T00:00:00Z')];
    expect(staleBackups(releases)).not.toContain('v1.0.0');
    expect(staleBackups(releases).every((t) => t.startsWith('backup-'))).toBe(true);
  });

  it('survives malformed entries', () => {
    expect(staleBackups([null, {}, { tagName: 5 }, ...many(2)])).toEqual([]);
  });

  it('handles an empty list', () => {
    expect(staleBackups([])).toEqual([]);
    expect(staleBackups(undefined)).toEqual([]);
  });
});

describe('planBackup', () => {
  it('plans a first backup when there are none', () => {
    expect(planBackup([], NOW)).toEqual({
      due: true,
      tag: 'backup-2026-08-08',
      delete: [],
      last: null,
    });
  });

  it('plans nothing when a recent backup exists', () => {
    const plan = planBackup([release('backup-2026-08-07', '2026-08-07T00:00:00Z')], NOW);
    expect(plan.due).toBe(false);
    expect(plan.delete).toEqual([]);
  });

  it('prunes only when it is also taking a backup', () => {
    // A quiet week must never reduce the number of restore points on hand.
    const old = Array.from({ length: 15 }, (_, i) =>
      release(`backup-2026-01-${String(i + 1).padStart(2, '0')}`, `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`));
    const recent = [...old, release('backup-2026-08-07', '2026-08-07T00:00:00Z')];

    expect(planBackup(recent, NOW).delete).toEqual([]);        // not due → prune nothing
    expect(planBackup(old, NOW).delete.length).toBeGreaterThan(0); // due → prune
  });
});
