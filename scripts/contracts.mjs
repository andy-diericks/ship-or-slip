#!/usr/bin/env node
// Ship or Slip — one round of the contract and documentation watch.
//
//   node scripts/contracts.mjs                     live, writes to ./.data
//   node scripts/contracts.mjs --data-dir=path     write somewhere else
//   node scripts/contracts.mjs --offline           use ./fixtures, no network
//   node scripts/contracts.mjs --dry-run           report, write nothing
//
// Separate from scripts/fetch.mjs on purpose (ADR 0004). This is a different
// data domain on a different cadence, and a failure in one must never hold up
// the other: the roadmap runs every six hours and its events are perishable,
// while a spec that fails to clone today is simply read tomorrow.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  contractSurface, diffSurfaces, describeChange, implausibleContractDiff,
} from './lib/openapi.mjs';
import { docState, diffDocs, resolveIncludes } from './lib/docwatch.mjs';
import { correlate, SURFACES } from './lib/apimap.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;

const DATA_DIR = path.resolve(option('data-dir', '.data'));
const OFFLINE = flag('offline');
const DRY_RUN = flag('dry-run');
const FIXTURES = path.resolve('fixtures/contracts');

const SPEC_REPO = 'https://github.com/Azure/azure-rest-api-specs.git';
const DOCS_REPO = 'https://github.com/MicrosoftDocs/azure-ai-docs.git';
const SPEC_DIR = 'specification/cognitiveservices/data-plane/AzureOpenAI/inference';
const RAW_SPECS = 'https://raw.githubusercontent.com/Azure/azure-rest-api-specs/main';

// Preferred first. A version directory carries one or both; `inference.json`
// is the hand-maintained document and `generated.json` the emitted one, and
// where both exist they describe the same surface.
const SPEC_FILES = ['inference.json', 'generated.json'];

const git = (cwd, ...argv) =>
  execFileSync('git', argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * A treeless shallow clone.
 *
 * `--filter=tree:0 --depth 1 --no-checkout` fetches ~200 KB up front and pulls
 * trees only for the directories actually listed. Cloning azure-rest-api-specs
 * outright is not viable; this makes enumerating it a two-second operation.
 */
function treelessClone(url, into) {
  fs.mkdirSync(path.dirname(into), { recursive: true });
  git(path.dirname(into), 'clone', '--quiet', '--filter=tree:0', '--depth', '1',
    '--no-checkout', url, into);
  return into;
}

/**
 * Which api-versions exist, read from the repository rather than from us.
 *
 * A hardcoded list would make a new api-version invisible until somebody
 * noticed, and a new api-version appearing is one of the more interesting
 * things this can report.
 *
 * The directory's own `readme.md` also declares a version list and is *stale* —
 * it stops at 2025-01-01-preview while later versions sit on disk beside it.
 * The listing is the truth; the readme is Microsoft's description of it.
 */
function listVersions(repo) {
  const versions = [];
  for (const channel of ['preview', 'stable']) {
    let out = '';
    try {
      out = git(repo, 'ls-tree', '--name-only', 'HEAD', `${SPEC_DIR}/${channel}/`);
    } catch {
      continue;
    }
    for (const line of out.split('\n').filter(Boolean)) {
      versions.push({ version: line.split('/').pop(), channel });
    }
  }
  return versions.sort((a, b) => a.version.localeCompare(b.version));
}

async function fetchText(url, { attempts = 3, timeoutMs = 60000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((r) => { setTimeout(r, 1000 * attempt); });
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

/** Read one version's spec, preferring the hand-maintained document. */
async function loadSpec({ version, channel }, fixtureRoot) {
  for (const file of SPEC_FILES) {
    if (fixtureRoot) {
      const local = path.join(fixtureRoot, 'specs', channel, version, file);
      if (fs.existsSync(local)) return { file, doc: JSON.parse(fs.readFileSync(local, 'utf8')) };
      continue;
    }
    const text = await fetchText(`${RAW_SPECS}/${SPEC_DIR}/${channel}/${version}/${file}`);
    if (text) return { file, doc: JSON.parse(text) };
  }
  return null;
}

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

async function run() {
  const generated = new Date().toISOString();
  const warnings = [];
  const workdir = OFFLINE ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'sos-contracts-'));

  // ---- contracts -----------------------------------------------------------

  let versions = [];
  if (OFFLINE) {
    for (const channel of ['preview', 'stable']) {
      const dir = path.join(FIXTURES, 'specs', channel);
      if (!fs.existsSync(dir)) continue;
      for (const version of fs.readdirSync(dir)) versions.push({ version, channel });
    }
  } else {
    try {
      versions = listVersions(treelessClone(SPEC_REPO, path.join(workdir, 'specs')));
    } catch (error) {
      warnings.push(`spec repo unavailable: ${error.message}`);
    }
  }

  const snapshotDir = path.join(DATA_DIR, 'current', 'contracts');
  const previousVersions = new Set(
    fs.existsSync(snapshotDir)
      ? fs.readdirSync(snapshotDir).map((f) => f.replace(/\.json$/, ''))
      : [],
  );

  const surfaces = [];
  const changes = [];
  for (const entry of versions) {
    let spec;
    try {
      spec = await loadSpec(entry, OFFLINE ? FIXTURES : null);
    } catch (error) {
      warnings.push(`${entry.version}: ${error.message}`);
      continue;
    }
    if (!spec) {
      warnings.push(`${entry.version}: no spec document found`);
      continue;
    }

    const surface = contractSurface(spec.doc, entry);
    surface.file = spec.file;
    const snapshotFile = path.join(snapshotDir, `${entry.version}.json`);
    const previous = readJson(snapshotFile, null);

    const versionChanges = diffSurfaces(previous, surface);
    const verdict = implausibleContractDiff(versionChanges, previous);
    if (verdict.held) {
      // Refuse the diff *and* the snapshot. Writing the new surface while
      // discarding its changes would silently adopt the suspect document as
      // the new baseline, so the next run would compare against it and find
      // nothing wrong — losing the evidence and the alarm together.
      warnings.push(`${entry.version}: held — ${verdict.reason}`);
      surfaces.push({ ...(previous ?? surface), held: true });
      continue;
    }

    for (const change of versionChanges) {
      changes.push({ ts: generated, version: entry.version, channel: entry.channel, ...change });
    }

    // A version we have never seen before. Reported as its own event rather
    // than as several hundred additions — the news is that the version exists.
    if (!previous && previousVersions.size > 0 && !previousVersions.has(entry.version)) {
      changes.push({
        ts: generated,
        version: entry.version,
        channel: entry.channel,
        type: 'version_added',
        target: entry.version,
        breaking: null,
      });
    }

    surfaces.push(surface);
    if (!DRY_RUN) writeJson(snapshotFile, surface);
  }

  // ---- documentation -------------------------------------------------------

  const trackedDocs = [...new Set(SURFACES.flatMap((s) => s.docs))];
  const docRoot = OFFLINE ? path.join(FIXTURES, 'docs') : path.join(workdir, 'docs');
  let docsAvailable = OFFLINE;

  if (!OFFLINE) {
    try {
      treelessClone(DOCS_REPO, docRoot);
      // One path at a time. `git checkout` fails the whole invocation if any
      // pathspec is unknown, so a single stale entry in the map would take
      // every tracked page down with it and report "docs unavailable" — a
      // total outage caused by one typo. Their includes are pulled in on
      // demand by the reader below.
      for (const docPath of trackedDocs) {
        try {
          git(docRoot, 'checkout', 'HEAD', '--', docPath);
        } catch {
          warnings.push(`doc path not in the repo: ${docPath}`);
        }
      }
      docsAvailable = true;
    } catch (error) {
      warnings.push(`docs repo unavailable: ${error.message}`);
    }
  }

  const readDoc = (p) => {
    try {
      return fs.readFileSync(path.join(docRoot, p), 'utf8');
    } catch {
      // An include the sparse checkout has not materialised yet. Fetching it
      // lazily keeps the checkout to the pages we actually track.
      if (OFFLINE || !docsAvailable) return null;
      try {
        git(docRoot, 'checkout', 'HEAD', '--', p);
        return fs.readFileSync(path.join(docRoot, p), 'utf8');
      } catch {
        return null;
      }
    }
  };

  const docs = {};
  const docText = {};
  if (docsAvailable) {
    for (const docPath of trackedDocs) {
      const state = docState(readDoc, docPath);
      if (!state) {
        warnings.push(`doc missing: ${docPath}`);
        continue;
      }
      docs[docPath] = state;
      docText[docPath] = resolveIncludes(readDoc, docPath).text;
    }
  }

  // A partially materialised checkout is the realistic way this goes wrong: a
  // handful of pages read, the rest missing, and `diffDocs` dutifully records
  // every absent page as removed — into an append-only log, from a failure
  // that had nothing to do with Microsoft. If most of the set did not read,
  // the round is treated as unavailable rather than as news.
  const readShare = trackedDocs.length ? Object.keys(docs).length / trackedDocs.length : 0;
  if (docsAvailable && readShare < 0.5) {
    warnings.push(
      `docs round discarded — only ${Object.keys(docs).length} of ${trackedDocs.length} pages read`,
    );
    docsAvailable = false;
  }

  const docSnapshotFile = path.join(DATA_DIR, 'current', 'docs.json');
  const previousDocs = readJson(docSnapshotFile, null);
  const docChanges = docsAvailable ? diffDocs(previousDocs, docs) : [];

  // ---- correlation ---------------------------------------------------------

  const findings = correlate(changes, docs, (p) => docText[p] ?? '');

  // ---- write ---------------------------------------------------------------

  // Contract changes are *appended*, not derived. Everything else this project
  // writes can be rebuilt from the current snapshots; a change between two
  // snapshots cannot — once the old surface is overwritten, the fact that it
  // moved exists nowhere else. Same reasoning as the roadmap event archive.
  const registerFile = path.join(DATA_DIR, 'contracts.json');
  const previousRegister = readJson(registerFile, { changes: [], findings: [] });

  const register = {
    generated,
    summary: {
      versions: surfaces.length,
      operations: surfaces.reduce((n, s) => n + Object.keys(s.operations).length, 0),
      schemas: surfaces.reduce((n, s) => n + Object.keys(s.schemas).length, 0),
      changesThisRun: changes.length,
      breakingThisRun: changes.filter((c) => c.breaking).length,
      undocumented: findings.filter((f) => f.kind === 'undocumented').length,
    },
    versions: surfaces
      .map((s) => ({
        version: s.version,
        channel: s.channel,
        file: s.file,
        operations: Object.keys(s.operations).length,
        schemas: Object.keys(s.schemas).length,
      }))
      .sort((a, b) => b.version.localeCompare(a.version)),
    changes: [...changes, ...(previousRegister.changes ?? [])],
    findings,
    warnings,
  };

  const docRegister = {
    generated,
    summary: {
      tracked: Object.keys(docs).length,
      changesThisRun: docChanges.length,
      freshnessOnly: docChanges.filter((c) => c.type === 'doc_freshness_only').length,
    },
    docs: Object.values(docs).sort((a, b) => a.path.localeCompare(b.path)),
    changes: [
      ...docChanges.map((c) => ({ ts: generated, ...c })),
      ...(readJson(path.join(DATA_DIR, 'docs.json'), { changes: [] }).changes ?? []),
    ],
    warnings,
  };

  for (const change of changes.slice(0, 10)) {
    console.log(`  ${change.version}: ${describeChange(change)}${change.breaking ? ' — BREAKING' : ''}`);
  }
  console.log(
    `contracts: ${surfaces.length} api-version(s), `
    + `${register.summary.operations} operations, ${register.summary.schemas} schemas, `
    + `${changes.length} change(s) this run (${register.summary.breakingThisRun} breaking)`,
  );
  console.log(
    `docs: ${Object.keys(docs).length} page(s) tracked, ${docChanges.length} change(s), `
    + `${findings.filter((f) => f.kind === 'undocumented').length} undocumented finding(s)`,
  );
  for (const warning of warnings) console.log(`  ! ${warning}`);

  if (DRY_RUN) {
    console.log('\nDry run — nothing written.');
  } else {
    writeJson(registerFile, register);
    // Only write the docs snapshot when the round stood up. Adopting a partial
    // read as the new baseline would make the next run compare against it and
    // find nothing wrong — losing the evidence and the alarm together, exactly
    // as with a held contract diff.
    if (docsAvailable) {
      writeJson(path.join(DATA_DIR, 'docs.json'), docRegister);
      writeJson(docSnapshotFile, docs);
    }
    console.log(`\nWrote ${DATA_DIR}`);
  }

  if (workdir) fs.rmSync(workdir, { recursive: true, force: true });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
