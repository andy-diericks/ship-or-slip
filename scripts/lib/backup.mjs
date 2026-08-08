// Backup scheduling and retention.
//
// The `data` branch is the only irreplaceable thing here: code can be
// rewritten in a day, but Microsoft will not re-serve a date it has already
// overwritten. A ruleset now blocks force-pushes and deletion, which covers
// the accidents. This covers the case where someone disables the ruleset
// because it is in the way — and gives an off-branch restore point.
//
// Backups are git *bundles*, not tarballs, so a restore returns the full
// commit history rather than a flat snapshot. Provenance — when each fact was
// recorded — is the product, and a tarball of `current/` would throw it away.

/** How often to take a bundle. */
export const BACKUP_INTERVAL_DAYS = 7;

/** How many bundles to keep before pruning the oldest. */
export const BACKUP_KEEP = 12;

/** Releases holding a backup are tagged `backup-YYYY-MM-DD`. */
export const BACKUP_TAG_PREFIX = 'backup-';

const DAY_MS = 86_400_000;

/**
 * Is a new backup due?
 *
 * Derived from the backups that actually exist rather than from a marker file,
 * so the schedule cannot drift from reality. A missing or unparseable date
 * means "never backed up", which is due.
 *
 * @param {string|null|undefined} lastCreatedAt ISO date of the newest backup
 * @param {Date} [now]
 * @param {number} [intervalDays]
 * @returns {boolean}
 */
export function backupDue(lastCreatedAt, now = new Date(), intervalDays = BACKUP_INTERVAL_DAYS) {
  if (!lastCreatedAt) return true;
  const last = Date.parse(lastCreatedAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= intervalDays * DAY_MS;
}

/** The tag for a backup taken now. */
export function backupTag(now = new Date()) {
  return `${BACKUP_TAG_PREFIX}${now.toISOString().slice(0, 10)}`;
}

/**
 * Which backup releases to prune.
 *
 * Newest `keep` are retained; everything older is returned for deletion.
 * Non-backup releases are never touched — this must not be able to delete a
 * real release just because retention ran.
 *
 * @param {{tagName: string, createdAt: string}[]} releases
 * @param {number} [keep]
 * @returns {string[]} tags to delete, oldest first
 */
export function staleBackups(releases, keep = BACKUP_KEEP) {
  const backups = (releases ?? [])
    .filter((r) => r && typeof r.tagName === 'string' && r.tagName.startsWith(BACKUP_TAG_PREFIX))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return backups.slice(0, Math.max(0, backups.length - keep)).map((r) => r.tagName);
}

/** The newest backup's creation date, or null when there are none. */
export function latestBackup(releases) {
  const backups = (releases ?? [])
    .filter((r) => r && typeof r.tagName === 'string' && r.tagName.startsWith(BACKUP_TAG_PREFIX))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return backups[0]?.createdAt ?? null;
}

/**
 * Turn the release list into a plan the workflow can act on.
 *
 * @param {{tagName: string, createdAt: string}[]} releases
 * @param {Date} [now]
 * @returns {{due: boolean, tag: string, delete: string[], last: string|null}}
 */
export function planBackup(releases, now = new Date()) {
  const last = latestBackup(releases);
  const due = backupDue(last, now);
  return {
    due,
    tag: backupTag(now),
    // Only prune when actually taking a backup, so a quiet week never reduces
    // the number of restore points on hand.
    delete: due ? staleBackups(releases) : [],
    last,
  };
}
