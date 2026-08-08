#!/usr/bin/env node
// Reads `gh release list --json tagName,createdAt` on stdin and prints a plan
// as shell-evaluable lines:
//
//   DUE=yes|no
//   TAG=backup-YYYY-MM-DD
//   DELETE=tag tag tag
//   LAST=<iso or empty>
//
// The decision logic lives in lib/backup.mjs where it is unit-tested; this is
// only the plumbing between `gh` and the workflow.

import { planBackup } from './lib/backup.mjs';

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { raw += chunk; });
    process.stdin.on('end', () => resolve(raw));
    // No stdin at all (a tty, or a closed pipe) means no releases yet.
    if (process.stdin.isTTY) resolve('');
  });
}

const raw = (await readStdin()).trim();

let releases = [];
if (raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) releases = parsed;
  } catch {
    // A malformed release list must not be read as "no backups exist" — that
    // would take a redundant backup every run and prune nothing. Fail loudly.
    console.error('backup-plan: could not parse the release list as JSON');
    process.exit(1);
  }
}

const plan = planBackup(releases, new Date());

console.log(`DUE=${plan.due ? 'yes' : 'no'}`);
console.log(`TAG=${plan.tag}`);
console.log(`DELETE=${plan.delete.join(' ')}`);
console.log(`LAST=${plan.last ?? ''}`);
