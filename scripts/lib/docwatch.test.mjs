import { describe, it, expect } from 'vitest';
import {
  parseFrontMatter, msDate, resolveIncludes, hashContent, docState, diffDocs, docLink,
} from './docwatch.mjs';

const files = {
  'articles/foundry/openai/how-to/responses.md': [
    '---',
    'title: "Use the Azure OpenAI Responses API"',
    'ms.date: 08/18/2026',
    'ms.custom:',
    '  - build-2025',
    '---',
    '',
    '# Use the Azure OpenAI Responses API',
    '',
    '[!INCLUDE [responses content](../includes/how-to-responses-content.md)]',
  ].join('\n'),
  // Deliberately much larger than the article that includes it: in the real
  // repo the stub is 581 bytes and the include is 138 KB, and a fixture that
  // inverted that would let a stub-only regression pass.
  'articles/foundry/openai/includes/how-to-responses-content.md':
    `---\nms.date: 01/01/2026\n---\nThe real documentation.\n${'body text. '.repeat(200)}`,
};

const read = (p) => files[p] ?? null;

describe('parseFrontMatter', () => {
  it('splits the header from the body', () => {
    const { data, body } = parseFrontMatter(files['articles/foundry/openai/how-to/responses.md']);
    expect(data.title).toBe('Use the Azure OpenAI Responses API');
    expect(body.trimStart().startsWith('# Use')).toBe(true);
  });

  it('skips indented list items rather than recording them as keys', () => {
    const { data } = parseFrontMatter(files['articles/foundry/openai/how-to/responses.md']);
    expect(data).not.toHaveProperty('- build-2025');
    expect(Object.keys(data)).toEqual(['title', 'ms.date', 'ms.custom']);
  });

  it('returns the whole text as body when there is no front matter', () => {
    expect(parseFrontMatter('# Just a heading').body).toBe('# Just a heading');
  });

  it('tolerates CRLF, which this repo is full of', () => {
    expect(parseFrontMatter('---\r\ntitle: A\r\n---\r\nbody').data.title).toBe('A');
  });

  it('handles empty and missing input', () => {
    expect(parseFrontMatter('')).toEqual({ data: {}, body: '' });
    expect(parseFrontMatter(null)).toEqual({ data: {}, body: '' });
  });
});

describe('msDate', () => {
  it('converts Microsoft s MM/DD/YYYY to ISO so it sorts', () => {
    expect(msDate({ 'ms.date': '08/18/2026' })).toBe('2026-08-18');
    expect(msDate({ 'ms.date': '1/5/2026' })).toBe('2026-01-05');
  });

  it('passes an already-ISO date through', () => {
    expect(msDate({ 'ms.date': '2026-08-18' })).toBe('2026-08-18');
  });

  it('returns null rather than guessing at an unparseable date', () => {
    // A date we could not read, silently rendered as today, would fabricate a
    // freshness claim Microsoft never made.
    expect(msDate({ 'ms.date': 'August 2026' })).toBeNull();
    expect(msDate({})).toBeNull();
    expect(msDate(null)).toBeNull();
  });
});

describe('resolveIncludes', () => {
  it('pulls the included content in — the whole reason this module exists', () => {
    const out = resolveIncludes(read, 'articles/foundry/openai/how-to/responses.md');
    expect(out.text).toContain('The real documentation');
    expect(out.includes).toEqual(['articles/foundry/openai/includes/how-to-responses-content.md']);
  });

  it('strips front matter from included files, so it cannot reach the hash', () => {
    const out = resolveIncludes(read, 'articles/foundry/openai/how-to/responses.md');
    expect(out.text).not.toContain('ms.date');
  });

  it('records a missing include instead of throwing', () => {
    const broken = { 'a/b.md': '[!INCLUDE [x](./gone.md)]' };
    const out = resolveIncludes((p) => broken[p] ?? null, 'a/b.md');
    expect(out.missing).toEqual(['a/gone.md']);
    expect(out.text).toBe('');
  });

  it('does not loop forever on a cycle', () => {
    const loop = {
      'a/one.md': 'one [!INCLUDE [x](./two.md)]',
      'a/two.md': 'two [!INCLUDE [x](./one.md)]',
    };
    const out = resolveIncludes((p) => loop[p] ?? null, 'a/one.md');
    expect(out.text).toContain('one');
    expect(out.text).toContain('two');
  });

  it('stops at the depth limit and says so', () => {
    const deep = {};
    for (let i = 0; i < 10; i += 1) deep[`a/${i}.md`] = `level${i} [!INCLUDE [x](./${i + 1}.md)]`;
    const out = resolveIncludes((p) => deep[p] ?? null, 'a/0.md', { maxDepth: 2 });
    expect(out.truncated).toBe(true);
  });

  it('refuses to escape the repo root', () => {
    const evil = { 'a.md': '[!INCLUDE [x](../../../etc/passwd)]' };
    const out = resolveIncludes((p) => evil[p] ?? null, 'a.md');
    expect(out.includes).toEqual([]);
  });

  it('ignores an anchor on the include target', () => {
    const anchored = { 'a/b.md': '[!INCLUDE [x](./c.md#section)]', 'a/c.md': 'content' };
    const out = resolveIncludes((p) => anchored[p] ?? null, 'a/b.md');
    expect(out.text).toContain('content');
  });
});

describe('hashContent', () => {
  it('is stable for identical content', () => {
    expect(hashContent('hello')).toBe(hashContent('hello'));
  });

  it('ignores line endings and trailing whitespace', () => {
    expect(hashContent('a\r\nb')).toBe(hashContent('a\nb'));
    expect(hashContent('a  \nb')).toBe(hashContent('a\nb'));
  });

  it('changes when the content does', () => {
    expect(hashContent('a')).not.toBe(hashContent('b'));
  });
});

describe('docState', () => {
  const state = () => docState(read, 'articles/foundry/openai/how-to/responses.md');

  it('records the resolved size, not the stub size', () => {
    // The regression this guards against is hashing the stub: an article that
    // is nothing but an include would then look unchanged forever.
    const s = state();
    expect(s.resolvedBytes).toBeGreaterThan(s.bytes * 5);
  });

  it('excludes front matter from the hash, so a date bump is not a content change', () => {
    const bumped = { ...files };
    bumped['articles/foundry/openai/how-to/responses.md'] =
      files['articles/foundry/openai/how-to/responses.md'].replace('08/18/2026', '09/01/2026');
    const after = docState((p) => bumped[p] ?? null, 'articles/foundry/openai/how-to/responses.md');
    expect(after.hash).toBe(state().hash);
    expect(after.msDate).toBe('2026-09-01');
  });

  it('notices a change inside the included file, not just the article', () => {
    const edited = { ...files };
    edited['articles/foundry/openai/includes/how-to-responses-content.md'] =
      '---\nms.date: 01/01/2026\n---\nNow it mentions annotations.\n';
    const after = docState((p) => edited[p] ?? null, 'articles/foundry/openai/how-to/responses.md');
    expect(after.hash).not.toBe(state().hash);
  });

  it('returns null when the article is gone', () => {
    expect(docState(read, 'articles/nope.md')).toBeNull();
  });
});

describe('diffDocs', () => {
  const base = { 'a.md': { path: 'a.md', title: 'A', hash: 'h1', msDate: '2026-01-01' } };
  const withDoc = (patch) => ({ 'a.md': { ...base['a.md'], ...patch } });

  it('reports nothing on first sight', () => {
    expect(diffDocs(null, base)).toEqual([]);
  });

  it('reports nothing when neither content nor date moved', () => {
    expect(diffDocs(base, base)).toEqual([]);
  });

  it('calls a normal edit an update', () => {
    const out = diffDocs(base, withDoc({ hash: 'h2', msDate: '2026-02-01' }));
    expect(out[0]).toMatchObject({ type: 'doc_updated', from: '2026-01-01', to: '2026-02-01' });
  });

  it('catches a date bump over byte-identical content', () => {
    // A page asserting it was reviewed on a day when nothing about it changed.
    const out = diffDocs(base, withDoc({ msDate: '2026-02-01' }));
    expect(out).toEqual([{
      type: 'doc_freshness_only', path: 'a.md', title: 'A', from: '2026-01-01', to: '2026-02-01',
    }]);
  });

  it('catches content moving while the date stands still', () => {
    const out = diffDocs(base, withDoc({ hash: 'h2' }));
    expect(out[0].type).toBe('doc_changed_silently');
  });

  it('notices pages appearing and disappearing', () => {
    expect(diffDocs(base, {})[0]).toMatchObject({ type: 'doc_removed', path: 'a.md' });
    expect(diffDocs({}, base)[0]).toMatchObject({ type: 'doc_added', path: 'a.md' });
  });
});

describe('docLink', () => {
  it('maps a repo path to the published page', () => {
    expect(docLink('articles/foundry/openai/how-to/responses.md'))
      .toBe('https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses');
  });

  it('handles a path with no articles prefix', () => {
    expect(docLink('x.md')).toBe('https://learn.microsoft.com/en-us/azure/x');
  });
});
