# ADR 0001 — Tech stack (FROZEN)

Status: accepted · Date: 2026-08-06

## Decision

- **Site**: Vite + React + TypeScript, at the repository root (`src/`).
- **Charts**: Recharts. No other charting library.
- **Styling**: plain CSS with design tokens (see ADR 0002). No CSS framework,
  no Tailwind, no component library.
- **Hosting**: GitHub Pages, built from `main` by `deploy-pages.yml`.
- **Pipeline**: plain Node ESM (`.mjs`) in `scripts/`, **zero runtime
  dependencies**, run by `node scripts/fetch.mjs`.
- **Tests**: Vitest, covering `src/` and `scripts/` in one run.
- **Package manager**: npm. Node 22.

## Why one project rather than an `app/` split

The predecessor project (`azure-pricing-radar`) put the site in `app/` and the
pipeline in Python under `scripts/`. That worked, but it meant CI installed two
toolchains, and the pipeline's output types had to be hand-mirrored between
`build-sku-index.js` and `skuIndex.ts` — a pair that can drift silently.

Here the pipeline and the site are one npm project in one language. `npm ci`
once, `npm test` covers both halves, and the data contract has exactly one
definition (`src/lib/types.ts`) that the pipeline is checked against by the
tests that consume its output.

## Why the pipeline has no dependencies

`scripts/fetch.mjs` runs on a schedule, unattended, and writes the data that
the entire site depends on. Node 22 has `fetch` built in, the Azure feed is one
well-formed RSS document from one publisher, and the rest is date arithmetic.
A dependency here buys nothing and adds a supply-chain surface plus an install
step to every scheduled run. The RSS reader in `scripts/lib/rss.mjs` is
deliberately small and must not grow into a general-purpose parser — if a
second, messier feed ever arrives, that is the moment to revisit this, via a
new ADR.

## Consequences

No alternative frameworks, chart libraries, CSS frameworks or build tools get
introduced without superseding this ADR. Proposals to revisit any of it are an
issue labelled `needs-human`, never a unilateral change.
