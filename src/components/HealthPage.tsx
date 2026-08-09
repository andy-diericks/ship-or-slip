import { useEffect, useState } from 'react';
import type { DataIndex, RunRecord } from '../lib/types';
import { loadRuns } from '../lib/data';
import { formatAge, formatDay } from '../lib/format';
import { gradeFreshness } from './FreshnessBadge';
import { runGaps, summariseRuns, MISSED_AFTER_HOURS, EXPECTED_INTERVAL_HOURS } from '../../scripts/lib/runs.mjs';

/**
 * Is the pipeline working?
 *
 * A different question from "what does the pipeline know", which the dashboard
 * answers. It went unanswered for a whole day when GitHub's scheduler silently
 * fired nothing and the only symptom was a badge slowly turning amber. The
 * cadence table below is the view that would have caught it in seconds.
 */
export function HealthPage({ index, onBack }: { index: DataIndex; onBack: () => void }) {
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadRuns(controller.signal)
      .then(setRuns)
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : 'Unknown error');
      });
    return () => controller.abort();
  }, []);

  const grade = gradeFreshness(index.generated, index.warnings.length > 0);
  const gaps = runs ? runGaps(runs) : [];
  const summary = runs ? summariseRuns(runs) : null;

  return (
    <div>
      <button type="button" className="back" onClick={onBack}>← Back to the feed</button>
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>Health</h2>
      <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 14 }}>
        Whether the pipeline is working — as opposed to what it knows. Expected
        every {EXPECTED_INTERVAL_HOURS} hours; a gap over {MISSED_AFTER_HOURS} hours
        means a dispatch did not happen.
      </p>

      <div className="tiles">
        <div className={`tile ${grade === 'ok' ? 'tone-pull' : grade === 'warn' ? 'tone-add' : 'tone-slip'}`}>
          <div className="tile__value" style={{ fontSize: 20 }}>{grade === 'ok' ? 'Healthy' : grade === 'warn' ? 'Late' : 'Stale'}</div>
          <div className="tile__label">Updated {formatAge(index.generated)}</div>
        </div>
        {summary && (
          <>
            <div className={summary.missedWindows > 0 ? 'tile tone-slip' : 'tile tone-pull'}>
              <div className="tile__value">{summary.missedWindows}</div>
              <div className="tile__label">Missed windows (last {summary.total} runs)</div>
            </div>
            <div className="tile tone-drop">
              <div className="tile__value">{summary.medianGapHours ?? '—'}</div>
              <div className="tile__label">Median hours between runs</div>
            </div>
            <div className={summary.heldRuns > 0 ? 'tile tone-add' : 'tile tone-drop'}>
              <div className="tile__value">{summary.heldRuns}</div>
              <div className="tile__label">Runs held by the anomaly guard</div>
            </div>
          </>
        )}
      </div>

      {index.warnings.length > 0 && (
        <div className="warnings" role="status">
          {index.warnings.map((w) => <div key={w}>{w}</div>)}
        </div>
      )}

      <section className="panel">
        <h3 className="panel__title">Sources</h3>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th>Source</th><th>Tracked</th><th>Scope</th><th>Last fetch</th><th>State</th></tr>
            </thead>
            <tbody>
              {Object.entries(index.sources).map(([name, meta]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="num">{meta.count}</td>
                  <td className="mono">{meta.scope ?? '—'}</td>
                  <td>{meta.fetched ? formatAge(meta.fetched) : 'never'}</td>
                  <td>
                    {meta.held ? <span className="badge tone-slip">held</span>
                      : meta.ok ? <span className="badge tone-pull">ok</span>
                      : <span className="badge tone-add">failed</span>}
                    {meta.seeded && <span className="badge tone-drop"> seeded</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3 className="panel__title">Run history</h3>
        {error && <p className="state">Could not load the run log: {error}</p>}
        {!runs && !error && <div className="skeleton" />}
        {runs && runs.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
            No runs recorded yet. The log starts from the first run after this page shipped.
          </p>
        )}
        {runs && runs.length > 0 && (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th>When</th><th>Gap</th><th>Events</th><th>Sources</th><th>Warnings</th></tr>
              </thead>
              <tbody>
                {runs.slice(0, 40).map((run, i) => {
                  const gap = gaps[i];
                  const missed = typeof gap === 'number' && gap > MISSED_AFTER_HOURS;
                  return (
                    <tr key={run.ts}>
                      <td title={run.ts}>{formatDay(run.ts)} {run.ts.slice(11, 16)}</td>
                      <td className={missed ? 'num tone-slip' : 'num'}>
                        {gap === null ? '—' : `${gap}h`}{missed ? ' ⚠' : ''}
                      </td>
                      <td className="num">{run.events}</td>
                      <td className="mono">
                        {Object.entries(run.sources).map(([n, s]) =>
                          `${n}:${s.count}${s.held ? ' held' : s.ok ? '' : ' fail'}`).join(' · ')}
                      </td>
                      <td className="num">{run.warnings.length || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h3 className="panel__title">Archive</h3>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>
          {index.months.length} month{index.months.length === 1 ? '' : 's'} of events
          {index.months.length > 0 && ` (${index.months[index.months.length - 1]} → ${index.months[0]})`}
          {' · '}{index.totals.recent} in the last {index.recentDays} days
          {index.overdue && ` · ${index.overdue.count} overdue`}
          {index.contradictions && ` · ${index.contradictions.count} contradictions`}
        </p>
      </section>
    </div>
  );
}

export default HealthPage;
