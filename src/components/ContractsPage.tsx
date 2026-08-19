import { useEffect, useState } from 'react';
import type {
  ContractRegister, DocRegister, ContractChange, DivergenceFinding, DocState,
} from '../lib/types';
import { CONTRACT_CHANGE_LABELS, DOC_CHANGE_LABELS } from '../lib/types';
import { loadContracts, loadDocs } from '../lib/data';
import { formatDate } from '../lib/format';

/**
 * The contract and documentation watch.
 *
 * Two claims, kept strictly apart. The first is ours to make and is arithmetic:
 * a published api-version is not what it was. The second is not an assertion at
 * all — it puts a contract change next to the pages that should describe it and
 * shows whether they mention it, leaving the conclusion to the reader.
 *
 * That restraint is the point. A generated "Microsoft hid this" would be the
 * first thing on this site that could be wrong in a way nobody could check.
 */
export function ContractsPage({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'empty' }
    | { status: 'ready'; contracts: ContractRegister; docs: DocRegister | null }
  >({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    loadContracts(controller.signal)
      .then(async (contracts) => {
        const docs = await loadDocs(controller.signal).catch(() => null);
        setState({ status: 'ready', contracts, docs });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // A 404 here means the daily watch has not run against this store yet,
        // which is a different thing from a broken page and reads differently.
        const message = error instanceof Error ? error.message : 'Unknown error';
        setState(message.includes('404') ? { status: 'empty' } : { status: 'error', message });
      });
    return () => controller.abort();
  }, []);

  const back = <button type="button" className="back" onClick={onBack}>← Back to the feed</button>;

  if (state.status === 'loading') {
    return (
      <div>
        {back}
        <div aria-busy="true" aria-label="Loading the contract watch">
          <div className="skeleton" /><div className="skeleton" />
        </div>
      </div>
    );
  }

  if (state.status === 'empty') {
    return (
      <div>
        {back}
        <div className="state">
          <p className="state__title">The contract watch has not run yet</p>
          <p>
            It runs once a day against the published Azure OpenAI specs. Nothing
            has been recorded for this store so far.
          </p>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div>
        {back}
        <div className="state">
          <p className="state__title">Could not load the contract watch</p>
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  const { contracts, docs } = state;
  const { summary } = contracts;
  const undocumented = contracts.findings.filter((f) => f.kind === 'undocumented');
  const breaking = contracts.changes.filter((c) => c.breaking);

  return (
    <div>
      {back}

      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>Contract watch</h2>
      <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 14 }}>
        Azure pins its APIs to an <code>api-version</code>, and the promise that
        carries is that the version does not move. Every published version of
        the Azure OpenAI spec is snapshotted daily and compared against its own
        previous snapshot — never against another version, because two versions
        differing is them doing their job.
      </p>

      <div className="tiles">
        <div className="tile tone-add">
          <div className="tile__value">{summary.versions}</div>
          <div className="tile__label">api-versions watched</div>
        </div>
        <div className="tile tone-slip">
          <div className="tile__value">{contracts.changes.length}</div>
          <div className="tile__label">Changes recorded</div>
        </div>
        <div className="tile tone-drop">
          <div className="tile__value">{breaking.length}</div>
          <div className="tile__label">Breaking for callers</div>
        </div>
        <div className="tile tone-retire">
          <div className="tile__value">{undocumented.length}</div>
          <div className="tile__label">Not mentioned in the docs</div>
        </div>
      </div>

      {undocumented.length > 0 && (
        <>
          <h3 style={{ margin: '24px 0 4px', fontSize: 16 }}>
            Changed, and the documentation does not mention it
          </h3>
          <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13 }}>
            Each row shows the symbol that changed and every page searched for
            it. The pages are Microsoft's; the search is a word-boundary match
            you can repeat yourself.
          </p>
          {undocumented.map((finding) => (
            <FindingRow key={`${finding.version}-${finding.symbol}`} finding={finding} />
          ))}
        </>
      )}

      <h3 style={{ margin: '24px 0 4px', fontSize: 16 }}>Recorded changes</h3>
      {contracts.changes.length === 0 ? (
        <div className="state">
          <p className="state__title">No version has moved since watching began</p>
          <p>
            Which is the correct outcome, and worth recording: {summary.versions}{' '}
            published versions holding still is the promise being kept. The
            archive starts the day the watching starts — nothing before it can
            be recovered.
          </p>
        </div>
      ) : (
        <div>
          {contracts.changes.slice(0, 100).map((change, i) => (
            <ChangeRow key={`${change.ts}-${change.version}-${change.target}-${i}`} change={change} />
          ))}
        </div>
      )}

      <h3 style={{ margin: '24px 0 8px', fontSize: 16 }}>Versions</h3>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>api-version</th><th>Channel</th>
              <th style={{ textAlign: 'right' }}>Operations</th>
              <th style={{ textAlign: 'right' }}>Schemas</th>
            </tr>
          </thead>
          <tbody>
            {contracts.versions.map((v) => (
              <tr key={v.version}>
                <td><code>{v.version}</code></td>
                <td>{v.channel}</td>
                <td style={{ textAlign: 'right' }}>{v.operations}</td>
                <td style={{ textAlign: 'right' }}>{v.schemas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {docs && <DocsSection docs={docs} />}

      {contracts.warnings.length > 0 && (
        <div className="state" style={{ marginTop: 24 }}>
          <p className="state__title">Warnings from the last run</p>
          <ul>{contracts.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function FindingRow({ finding }: { finding: DivergenceFinding }) {
  return (
    <div className="event">
      <h4 className="event__title" style={{ fontSize: 15 }}>
        <code>{finding.symbol}</code> — {CONTRACT_CHANGE_LABELS[finding.change.type] ?? finding.change.type}
      </h4>
      <div className="event__meta">
        <span className="badge tone-slip">{finding.surfaceLabel}</span>
        <span className="event__move"><code>{finding.version}</code></span>
        {finding.change.breaking && (
          <span className="badge tone-drop">Breaking for the {finding.change.breaking}</span>
        )}
      </div>
      <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--muted)' }}>
        {finding.docs.map((doc) => (
          <li key={doc.path}>
            {doc.mentions ? '✅ mentions it' : '❌ does not mention it'} —{' '}
            <a
              href={`https://learn.microsoft.com/en-us/azure/${doc.path.replace(/^articles\//, '').replace(/\.md$/, '')}`}
              target="_blank"
              rel="noreferrer"
            >
              {doc.title ?? doc.path}
            </a>
            {doc.msDate && <> · Microsoft dates it {formatDate(doc.msDate)}</>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChangeRow({ change }: { change: ContractChange }) {
  return (
    <div className="event">
      <div className="event__meta">
        <span className={change.breaking ? 'badge tone-drop' : 'badge tone-add'}>
          {CONTRACT_CHANGE_LABELS[change.type] ?? change.type}
        </span>
        <span className="event__move"><code>{change.version}</code></span>
        <span className="event__id">
          <code>{change.target}{change.field ? `.${change.field}` : ''}</code>
        </span>
        {change.value && <span className="event__product">“{change.value}”</span>}
      </div>
    </div>
  );
}

function DocsSection({ docs }: { docs: DocRegister }) {
  const stubs = docs.docs.filter((d) => d.resolvedBytes > d.bytes * 5);

  return (
    <>
      <h3 style={{ margin: '24px 0 4px', fontSize: 16 }}>Documentation watched</h3>
      <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13 }}>
        <strong>Claimed</strong> is Microsoft's own <code>ms.date</code> — a
        freshness assertion, not a modification time. <strong>Resolved</strong> is
        the size after transclusions are followed:{' '}
        {stubs.length} of these {docs.docs.length} pages are stubs whose real
        content lives in an included file, so watching the article alone would
        report them unchanged forever.
      </p>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Page</th><th>Claimed</th>
              <th style={{ textAlign: 'right' }}>Article</th>
              <th style={{ textAlign: 'right' }}>Resolved</th>
            </tr>
          </thead>
          <tbody>
            {docs.docs.map((doc) => <DocRow key={doc.path} doc={doc} />)}
          </tbody>
        </table>
      </div>

      {docs.changes.length > 0 && (
        <>
          <h3 style={{ margin: '24px 0 8px', fontSize: 16 }}>Documentation changes</h3>
          <div>
            {docs.changes.slice(0, 50).map((change, i) => (
              <div className="event" key={`${change.ts}-${change.path}-${i}`}>
                <div className="event__meta">
                  <span
                    className={
                      change.type === 'doc_freshness_only' ? 'badge tone-slip' : 'badge tone-add'
                    }
                  >
                    {DOC_CHANGE_LABELS[change.type] ?? change.type}
                  </span>
                  <span className="event__id">{change.title ?? change.path}</span>
                  {change.from !== change.to && (
                    <span className="event__move">{change.from ?? '—'} → {change.to ?? '—'}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function DocRow({ doc }: { doc: DocState }) {
  const link = `https://learn.microsoft.com/en-us/azure/${doc.path.replace(/^articles\//, '').replace(/\.md$/, '')}`;
  return (
    <tr>
      <td>
        <a href={link} target="_blank" rel="noreferrer">{doc.title ?? doc.path}</a>
      </td>
      <td>{doc.msDate ? formatDate(doc.msDate) : '—'}</td>
      <td style={{ textAlign: 'right' }}>{doc.bytes.toLocaleString()}</td>
      <td style={{ textAlign: 'right' }}>
        {doc.resolvedBytes.toLocaleString()}
        {doc.resolvedBytes > doc.bytes * 5 && (
          <span title="A stub whose content arrives through an include"> ↗</span>
        )}
      </td>
    </tr>
  );
}

export default ContractsPage;
