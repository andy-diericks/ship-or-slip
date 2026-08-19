import { describe, it, expect } from 'vitest';
import { correlate, surfaceFor, primarySymbol, mentions, SURFACES } from './apimap.mjs';

const change = (patch = {}) => ({
  type: 'required_added', target: 'InputText', field: 'annotations', breaking: 'caller', ...patch,
});

const docs = {
  'articles/foundry/openai/how-to/responses.md': {
    path: 'articles/foundry/openai/how-to/responses.md',
    title: 'Use the Azure OpenAI Responses API',
    msDate: '2026-08-18',
  },
  'articles/foundry/agents/quickstarts/responses-api.md': {
    path: 'articles/foundry/agents/quickstarts/responses-api.md',
    title: 'Quickstart: Build agents using the Responses API',
    msDate: '2026-07-07',
  },
};

const silent = () => 'This page explains how to create and stream a response.';

describe('surfaceFor', () => {
  it('maps a Responses schema to the Responses surface', () => {
    expect(surfaceFor(change())?.id).toBe('responses');
    expect(surfaceFor(change({ target: 'OutputText' }))?.id).toBe('responses');
  });

  it('maps an operation by its route, not its schema pattern', () => {
    expect(surfaceFor({ target: 'POST /responses' })?.id).toBe('responses');
    expect(surfaceFor({ target: 'POST /batches' })?.id).toBe('batch');
  });

  it('returns null for a surface nobody has mapped', () => {
    // The stated limitation: unmapped means silent, never guessed.
    expect(surfaceFor({ target: 'AudioTranscription' })).toBeNull();
    expect(surfaceFor({ target: 'GET /models' })).toBeNull();
  });
});

describe('primarySymbol', () => {
  it('prefers the changed field, which is what a reader would search for', () => {
    expect(primarySymbol(change())).toBe('annotations');
  });

  it('falls back to the target when no field changed', () => {
    expect(primarySymbol({ target: 'POST /responses' })).toBe('POST /responses');
  });

  it('returns null when there is nothing to search for', () => {
    expect(primarySymbol({})).toBeNull();
  });
});

describe('mentions', () => {
  it('matches on a word boundary', () => {
    expect(mentions('send the annotations array', 'annotations')).toBe(true);
    expect(mentions('"annotations": []', 'annotations')).toBe(true);
  });

  it('does not match inside a longer identifier', () => {
    expect(mentions('the annotationsList field', 'annotations')).toBe(false);
  });

  it('is case-sensitive, so prose about annotating does not count as documentation', () => {
    expect(mentions('Annotating your data', 'annotations')).toBe(false);
    expect(mentions('use OutputText here', 'outputtext')).toBe(false);
  });

  it('handles symbols with regex characters in them', () => {
    expect(mentions('call POST /responses now', 'POST /responses')).toBe(true);
  });

  it('is false for empty input rather than throwing', () => {
    expect(mentions('', 'x')).toBe(false);
    expect(mentions('x', '')).toBe(false);
    expect(mentions(null, null)).toBe(false);
  });
});

describe('correlate', () => {
  it('reports undocumented when no mapped page mentions the symbol', () => {
    const out = correlate([change()], docs, silent);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'undocumented', surface: 'responses', symbol: 'annotations' });
  });

  it('shows its working, so the claim can be checked rather than taken', () => {
    const [finding] = correlate([change()], docs, silent);
    expect(finding.docs).toEqual([
      {
        path: 'articles/foundry/openai/how-to/responses.md',
        title: 'Use the Azure OpenAI Responses API',
        msDate: '2026-08-18',
        mentions: false,
      },
      {
        path: 'articles/foundry/agents/quickstarts/responses-api.md',
        title: 'Quickstart: Build agents using the Responses API',
        msDate: '2026-07-07',
        mentions: false,
      },
    ]);
  });

  it('reports documented when any one mapped page mentions it', () => {
    const out = correlate([change()], docs, (p) => (
      p.endsWith('responses.md') ? 'you must send annotations as an empty array' : silent()
    ));
    expect(out[0].kind).toBe('documented');
  });

  it('stays silent on an unmapped surface', () => {
    expect(correlate([change({ target: 'AudioTranscription' })], docs, silent)).toEqual([]);
  });

  it('stays silent when the surface is mapped but we track none of its pages', () => {
    // "We have no page for this" is not the same claim as "this is
    // undocumented", and only the second one would be an accusation.
    expect(correlate([change()], {}, silent)).toEqual([]);
  });

  it('puts undocumented findings first', () => {
    const out = correlate(
      [change({ field: 'documented_field' }), change({ field: 'missing_field' })],
      docs,
      (p) => (p.endsWith('responses.md') ? 'the documented_field is explained here' : silent()),
    );
    expect(out.map((f) => f.kind)).toEqual(['undocumented', 'documented']);
  });

  it('handles an empty change list', () => {
    expect(correlate([], docs, silent)).toEqual([]);
    expect(correlate(null, docs, silent)).toEqual([]);
  });
});

describe('SURFACES', () => {
  it('gives every surface an id, a label and at least one doc', () => {
    for (const s of SURFACES) {
      expect(s.id).toBeTruthy();
      expect(s.label).toBeTruthy();
      expect(s.docs.length).toBeGreaterThan(0);
      expect(s.docs.every((d) => d.startsWith('articles/') && d.endsWith('.md'))).toBe(true);
    }
  });

  it('has unique ids', () => {
    expect(new Set(SURFACES.map((s) => s.id)).size).toBe(SURFACES.length);
  });
});

describe('correlate deduplication', () => {
  const docs2 = {
    'articles/foundry/openai/how-to/responses.md': { title: 'R', msDate: '2026-08-18' },
  };

  it('collapses one symbol to one finding', () => {
    // A property becoming required also appears as a property being added.
    const out = correlate([
      { type: 'required_added', target: 'InputText', field: 'annotations', breaking: 'caller', version: 'v1' },
      { type: 'property_added', target: 'InputText', field: 'annotations', breaking: null, version: 'v1' },
    ], docs2, () => 'nothing relevant');
    expect(out).toHaveLength(1);
    expect(out[0].change.type).toBe('required_added');
  });

  it('keeps the breaking change whichever order they arrive in', () => {
    const out = correlate([
      { type: 'property_added', target: 'InputText', field: 'annotations', breaking: null, version: 'v1' },
      { type: 'required_added', target: 'InputText', field: 'annotations', breaking: 'caller', version: 'v1' },
    ], docs2, () => 'nothing relevant');
    expect(out).toHaveLength(1);
    expect(out[0].change.breaking).toBe('caller');
  });

  it('keeps the same symbol separate per api-version', () => {
    const out = correlate([
      { type: 'required_added', target: 'InputText', field: 'annotations', breaking: 'caller', version: 'v1' },
      { type: 'required_added', target: 'InputText', field: 'annotations', breaking: 'caller', version: 'v2' },
    ], docs2, () => 'nothing relevant');
    expect(out.map((f) => f.version)).toEqual(['v1', 'v2']);
  });
});
