import { describe, it, expect } from 'vitest';
import {
  contractSurface, diffSurfaces, describeChange, changeSymbols, BREAKING,
  implausibleContractDiff,
} from './openapi.mjs';

const swagger = {
  info: { title: 'Test API', version: '2025-04-01-preview' },
  paths: {
    '/responses': {
      post: {
        operationId: 'createResponse',
        parameters: [
          { name: 'api-version', required: true },
          { name: 'trace', required: false },
        ],
      },
      get: { operationId: 'listResponses' },
    },
  },
  definitions: {
    InputText: {
      required: ['type', 'text'],
      properties: { type: { enum: ['input_text'] }, text: {} },
    },
    OutputText: {
      required: ['type', 'text', 'annotations'],
      properties: { type: { enum: ['output_text'] }, text: {}, annotations: {} },
    },
    Role: { enum: ['user', 'assistant'] },
  },
};

const surface = (doc = swagger) => contractSurface(doc, { version: 'v1', channel: 'preview' });

// Mutate a deep copy, so a test cannot leak into the next one.
const mutate = (fn) => {
  const next = JSON.parse(JSON.stringify(surface()));
  fn(next);
  return next;
};

describe('contractSurface', () => {
  it('reads Swagger 2.0 definitions', () => {
    expect(Object.keys(surface().schemas).sort()).toEqual(['InputText', 'OutputText', 'Role']);
  });

  it('reads OpenAPI 3 components.schemas too', () => {
    const v3 = { components: { schemas: { Thing: { required: ['a'], properties: { a: {} } } } } };
    expect(contractSurface(v3).schemas.Thing.required).toEqual(['a']);
  });

  it('flattens each operation to METHOD route', () => {
    expect(Object.keys(surface().operations).sort()).toEqual(['GET /responses', 'POST /responses']);
  });

  it('keeps only required parameters', () => {
    expect(surface().operations['POST /responses'].required).toEqual(['api-version']);
  });

  it('sorts required and properties, so a reordered spec is not a change', () => {
    const reordered = JSON.parse(JSON.stringify(swagger));
    reordered.definitions.OutputText.required = ['annotations', 'text', 'type'];
    expect(diffSurfaces(surface(), contractSurface(reordered))).toEqual([]);
  });

  it('captures per-property enums', () => {
    expect(surface().schemas.InputText.enums).toEqual({ type: ['input_text'] });
  });

  it('captures a schema that is itself an enum', () => {
    expect(surface().schemas.Role.enums['']).toEqual(['assistant', 'user']);
  });

  it('ignores descriptions and examples, which change constantly and bind nobody', () => {
    const chatty = JSON.parse(JSON.stringify(swagger));
    chatty.definitions.InputText.description = 'Now with feeling';
    chatty.definitions.InputText.properties.text = { description: 'the text', example: 'hi' };
    chatty.info.title = 'Test API (rebranded)';
    expect(diffSurfaces(surface(), contractSurface(chatty))).toEqual([]);
  });

  it('survives an empty or malformed document rather than throwing', () => {
    expect(contractSurface({}).schemas).toEqual({});
    expect(contractSurface(null).operations).toEqual({});
  });
});

describe('diffSurfaces', () => {
  it('reports nothing on first sight, because that is not a change Microsoft made', () => {
    expect(diffSurfaces(null, surface())).toEqual([]);
  });

  it('reports nothing when the surface is identical', () => {
    expect(diffSurfaces(surface(), surface())).toEqual([]);
  });

  it('catches a property becoming required — the breaking one', () => {
    const after = mutate((s) => {
      s.schemas.InputText.required.push('annotations');
      s.schemas.InputText.properties.push('annotations');
    });
    const out = diffSurfaces(surface(), after);
    expect(out.map((c) => c.type).sort()).toEqual(['property_added', 'required_added']);
    expect(out.find((c) => c.type === 'required_added')).toMatchObject({
      target: 'InputText', field: 'annotations', breaking: 'caller',
    });
  });

  it('does not call a loosened requirement breaking', () => {
    const after = mutate((s) => { s.schemas.OutputText.required = ['type', 'text']; });
    const out = diffSurfaces(surface(), after);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'required_removed', breaking: null });
  });

  it('catches a removed operation', () => {
    const after = mutate((s) => { delete s.operations['POST /responses']; });
    expect(diffSurfaces(surface(), after)).toEqual([
      { type: 'operation_removed', target: 'POST /responses', breaking: 'caller' },
    ]);
  });

  it('catches a removed enum value, and does not flag an added one as breaking', () => {
    const after = mutate((s) => { s.schemas.Role.enums[''] = ['assistant', 'system']; });
    const out = diffSurfaces(surface(), after);
    expect(out.find((c) => c.type === 'enum_removed')).toMatchObject({ value: 'user', breaking: 'caller' });
    expect(out.find((c) => c.type === 'enum_added')).toMatchObject({ value: 'system', breaking: null });
  });

  it('reports a whole schema appearing or vanishing once, not per property', () => {
    const after = mutate((s) => { delete s.schemas.OutputText; });
    expect(diffSurfaces(surface(), after)).toEqual([
      { type: 'schema_removed', target: 'OutputText', breaking: 'consumer' },
    ]);
  });

  it('skips the enum comparison when only one side constrains the property', () => {
    // Reported through the property lists instead; comparing against a missing
    // enum would claim every legal value had just been removed.
    const after = mutate((s) => { delete s.schemas.InputText.enums.type; });
    expect(diffSurfaces(surface(), after).filter((c) => c.type.startsWith('enum_'))).toEqual([]);
  });

  it('records additions too — a pinned version is meant to be frozen', () => {
    const after = mutate((s) => { s.operations['POST /responses/{id}/cancel'] = { required: [] }; });
    expect(diffSurfaces(surface(), after)).toEqual([
      { type: 'operation_added', target: 'POST /responses/{id}/cancel', breaking: null },
    ]);
  });
});

describe('describeChange', () => {
  it('words each type in plain English', () => {
    expect(describeChange({ type: 'required_added', target: 'InputText', field: 'annotations' }))
      .toBe('InputText.annotations became required');
    expect(describeChange({ type: 'operation_removed', target: 'POST /responses' }))
      .toBe('POST /responses was removed');
  });

  it('falls back rather than printing undefined for an unknown type', () => {
    expect(describeChange({ type: 'wat', target: 'Thing' })).toBe('Thing changed');
  });
});

describe('changeSymbols', () => {
  it('lists the symbols a change touches, deduplicated', () => {
    expect(changeSymbols({ target: 'InputText', field: 'annotations' }))
      .toEqual(['InputText', 'annotations']);
    expect(changeSymbols({ target: 'Role', field: 'Role' })).toEqual(['Role']);
  });

  it('handles a change with nothing but a target', () => {
    expect(changeSymbols({ target: 'X' })).toEqual(['X']);
    expect(changeSymbols(null)).toEqual([]);
  });
});

describe('BREAKING', () => {
  it('classifies every type diffSurfaces can emit', () => {
    const emitted = [
      'required_added', 'required_removed', 'property_added', 'property_removed',
      'enum_added', 'enum_removed', 'operation_added', 'operation_removed',
      'schema_added', 'schema_removed',
    ];
    for (const type of emitted) expect(BREAKING).toHaveProperty(type);
  });
});

describe('implausibleContractDiff', () => {
  const previous = surface();
  const many = (n) => Array.from({ length: n }, (_, i) => ({ type: 'property_removed', target: `S${i}` }));

  it('lets a normal diff through', () => {
    expect(implausibleContractDiff(many(2), previous).held).toBe(false);
    expect(implausibleContractDiff([], previous).held).toBe(false);
  });

  it('never holds a diff below the floor, however small the surface', () => {
    // A tiny spec legitimately changing a few things is not an anomaly.
    expect(implausibleContractDiff(many(39), { operations: {}, schemas: {} }).held).toBe(false);
  });

  it('holds a diff that moved most of the surface', () => {
    const big = { operations: {}, schemas: Object.fromEntries(many(100).map((c, i) => [`S${i}`, {}])) };
    const verdict = implausibleContractDiff(many(60), big);
    expect(verdict.held).toBe(true);
    expect(verdict.reason).toMatch(/60 changes across a surface of 100/);
  });

  it('holds a large diff with no previous surface to size it against', () => {
    expect(implausibleContractDiff(many(50), null).held).toBe(true);
    expect(implausibleContractDiff(many(50), null).reason).toMatch(/empty previous surface/);
  });

  it('respects overridden thresholds', () => {
    expect(implausibleContractDiff(many(5), previous, { minChanges: 1, maxRatio: 0.01 }).held).toBe(true);
  });
});
