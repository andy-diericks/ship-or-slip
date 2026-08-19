import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContractsPage } from './ContractsPage';
import type { ContractRegister, DocRegister } from '../lib/types';

vi.mock('../lib/data', () => ({
  loadContracts: vi.fn(),
  loadDocs: vi.fn(),
}));

const { loadContracts, loadDocs } = await import('../lib/data');

const contracts: ContractRegister = {
  generated: '2026-08-19T12:00:00.000Z',
  summary: {
    versions: 27, operations: 602, schemas: 3242,
    changesThisRun: 1, breakingThisRun: 1, undocumented: 1,
  },
  versions: [
    { version: '2025-04-01-preview', channel: 'preview', file: 'inference.json', operations: 52, schemas: 342 },
  ],
  changes: [{
    ts: '2026-08-19T12:00:00.000Z',
    version: '2025-04-01-preview',
    channel: 'preview',
    type: 'required_added',
    target: 'InputText',
    field: 'annotations',
    breaking: 'caller',
  }],
  findings: [{
    kind: 'undocumented',
    surface: 'responses',
    surfaceLabel: 'Responses API',
    version: '2025-04-01-preview',
    symbol: 'annotations',
    change: {
      ts: '2026-08-19T12:00:00.000Z',
      version: '2025-04-01-preview',
      channel: 'preview',
      type: 'required_added',
      target: 'InputText',
      field: 'annotations',
      breaking: 'caller',
    },
    docs: [{
      path: 'articles/foundry/openai/how-to/responses.md',
      title: 'Use the Azure OpenAI Responses API',
      msDate: '2026-08-18',
      mentions: false,
    }],
  }],
  warnings: [],
};

const docs: DocRegister = {
  generated: '2026-08-19T12:00:00.000Z',
  summary: { tracked: 1, changesThisRun: 1, freshnessOnly: 1 },
  docs: [{
    path: 'articles/foundry/openai/how-to/responses.md',
    title: 'Use the Azure OpenAI Responses API',
    msDate: '2026-08-18',
    hash: 'abc',
    bytes: 581,
    resolvedBytes: 138276,
    includes: ['articles/foundry/openai/includes/how-to-responses-content.md'],
    missingIncludes: [],
  }],
  changes: [{
    ts: '2026-08-19T12:00:00.000Z',
    type: 'doc_freshness_only',
    path: 'articles/foundry/openai/how-to/responses.md',
    title: 'Use the Azure OpenAI Responses API',
    from: '2026-07-01',
    to: '2026-08-18',
  }],
  warnings: [],
};

beforeEach(() => {
  vi.mocked(loadContracts).mockResolvedValue(contracts);
  vi.mocked(loadDocs).mockResolvedValue(docs);
});

describe('ContractsPage', () => {
  it('leads with the undocumented finding', async () => {
    render(<ContractsPage onBack={vi.fn()} />);
    expect(await screen.findByText(/Changed, and the documentation does not mention it/i))
      .toBeInTheDocument();
    expect(screen.getAllByText('annotations').length).toBeGreaterThan(0);
  });

  it('shows its working — which page was searched, and the answer', async () => {
    render(<ContractsPage onBack={vi.fn()} />);
    // The evidence line mixes a verdict, a link and a date in one list item,
    // so it is read as a whole rather than as one text node.
    const evidence = await screen.findAllByRole('listitem');
    const line = evidence.find((li) => li.textContent?.includes('does not mention it'));
    expect(line).toBeDefined();
    expect(line?.textContent).toContain('Use the Azure OpenAI Responses API');
    expect(line?.textContent).toMatch(/Microsoft dates it/);
    expect(screen.getAllByRole('link', { name: /Use the Azure OpenAI Responses API/ }).length)
      .toBeGreaterThan(0);
  });

  it('names who a breaking change breaks', async () => {
    render(<ContractsPage onBack={vi.fn()} />);
    expect(await screen.findByText(/Breaking for the caller/i)).toBeInTheDocument();
  });

  it('reports the stub-versus-resolved gap rather than hiding it', async () => {
    render(<ContractsPage onBack={vi.fn()} />);
    expect(await screen.findByText(/138,276/)).toBeInTheDocument();
    expect(screen.getByText(/1 of these 1 pages are stubs/i)).toBeInTheDocument();
  });

  it('surfaces a freshness-only bump as its own finding', async () => {
    render(<ContractsPage onBack={vi.fn()} />);
    expect(await screen.findByText(/Date bumped, content identical/i)).toBeInTheDocument();
  });

  it('says nothing has moved when nothing has, rather than showing an empty list', async () => {
    vi.mocked(loadContracts).mockResolvedValue({
      ...contracts,
      changes: [],
      findings: [],
      summary: { ...contracts.summary, changesThisRun: 0, breakingThisRun: 0, undocumented: 0 },
    });
    render(<ContractsPage onBack={vi.fn()} />);
    expect(await screen.findByText(/No version has moved since watching began/i))
      .toBeInTheDocument();
  });

  it('distinguishes "has not run yet" from "broken"', async () => {
    vi.mocked(loadContracts).mockRejectedValue(new Error('Could not load contracts.json (HTTP 404)'));
    render(<ContractsPage onBack={vi.fn()} />);
    expect(await screen.findByText(/has not run yet/i)).toBeInTheDocument();
  });

  it('reports a real failure as a failure', async () => {
    vi.mocked(loadContracts).mockRejectedValue(new Error('network down'));
    render(<ContractsPage onBack={vi.fn()} />);
    expect(await screen.findByText(/Could not load the contract watch/i)).toBeInTheDocument();
  });

  it('renders without the docs register, which is written by the same run but optional', async () => {
    vi.mocked(loadDocs).mockRejectedValue(new Error('404'));
    render(<ContractsPage onBack={vi.fn()} />);
    expect(await screen.findByText(/api-versions watched/i)).toBeInTheDocument();
    expect(screen.queryByText(/Documentation watched/i)).not.toBeInTheDocument();
  });
});
