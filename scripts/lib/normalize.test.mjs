import { describe, it, expect } from 'vitest';
import { normalizeM365, normalizeAzure, isRetirement } from './normalize.mjs';
import { parseRss, stripMarkup, decodeEntities } from './rss.mjs';

const roadmapItem = (overrides = {}) => ({
  id: 568792,
  title: 'Planner: Refreshed experience',
  description: 'A cleaner interface.',
  publicDisclosureAvailabilityDate: 'September CY2026',
  publicPreviewDate: 'May CY2026',
  status: 'In development',
  modified: '2026-08-05T22:47:32',
  tagsContainer: {
    products: [{ tagName: 'Planner' }],
    cloudInstances: [{ tagName: 'GCC High' }],
    releasePhase: [{ tagName: 'General Availability' }],
    platforms: [{ tagName: 'Web' }],
  },
  ...overrides,
});

describe('normalizeM365', () => {
  it('maps the tracked fields and namespaces the id', () => {
    const [item] = normalizeM365([roadmapItem()]);
    expect(item.id).toBe('m365:568792');
    expect(item.source).toBe('m365');
    expect(item.date).toBe('2026-09');
    expect(item.dateRaw).toBe('September CY2026');
    expect(item.preview).toBe('2026-05');
    expect(item.status).toBe('In development');
    expect(item.products).toEqual(['Planner']);
    expect(item.clouds).toEqual(['GCC High']);
    expect(item.phases).toEqual(['General Availability']);
  });

  it('builds a link back to the roadmap entry', () => {
    const [item] = normalizeM365([roadmapItem()]);
    expect(item.link).toContain('featureid=568792');
  });

  it('keeps items whose availability date is blank', () => {
    const [item] = normalizeM365([roadmapItem({ publicDisclosureAvailabilityDate: '' })]);
    expect(item.date).toBeNull();
    expect(item.dateRaw).toBeNull();
    expect(item.title).toBe('Planner: Refreshed experience');
  });

  it('survives a missing tags container', () => {
    const [item] = normalizeM365([roadmapItem({ tagsContainer: undefined })]);
    expect(item.products).toEqual([]);
    expect(item.phases).toEqual([]);
  });

  it('drops entries with no id and tolerates a non-array payload', () => {
    expect(normalizeM365([{ title: 'no id' }])).toEqual([]);
    expect(normalizeM365(null)).toEqual([]);
    expect(normalizeM365(undefined)).toEqual([]);
  });
});

const rss = (items) =>
  `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel>${items}</channel></rss>`;

const azureItem = ({
  guid = '567979',
  title = 'Retirement: Nested confidential VMs will be retired on September 1, 2026',
  categories = ['Retirements', 'Compute'],
  description = 'These VMs are going away.',
  pubDate = 'Thu, 06 Aug 2026 16:40:19 Z',
} = {}) =>
  `<item><guid isPermaLink="false">${guid}</guid>` +
  `<link>https://azure.microsoft.com/updates?id=${guid}</link>` +
  categories.map((c) => `<category>${c}</category>`).join('') +
  `<title>${title}</title><description>${description}</description>` +
  `<pubDate>${pubDate}</pubDate></item>`;

describe('normalizeAzure', () => {
  it('keeps retirement notices and parses the date out of the title', () => {
    const [item] = normalizeAzure(rss(azureItem()));
    expect(item.id).toBe('azure:567979');
    expect(item.source).toBe('azure');
    expect(item.date).toBe('2026-09-01');
  });

  it('discards ordinary updates', () => {
    const xml = rss(
      azureItem({ guid: '1', title: 'Generally available: faster disks', categories: ['Storage'] }),
    );
    expect(normalizeAzure(xml)).toEqual([]);
  });

  it('falls back to the description for the date', () => {
    const xml = rss(
      azureItem({
        title: 'Retirement: Azure Blueprints',
        description: 'Migrate away by January 31, 2027.',
      }),
    );
    expect(normalizeAzure(xml)[0].date).toBe('2027-01-31');
  });

  it('keeps a dated-less retirement so the date appearing later is an event', () => {
    const xml = rss(
      azureItem({ title: 'Retirement: something goes away', description: 'Soon.' }),
    );
    const [item] = normalizeAzure(xml);
    expect(item.date).toBeNull();
    expect(item.dateRaw).toBeNull();
  });

  it('strips the meta categories out of the product list', () => {
    const [item] = normalizeAzure(rss(azureItem({ categories: ['Retirements', 'Feature', 'Compute'] })));
    expect(item.products).toEqual(['Compute']);
  });

  it('returns nothing for an empty or malformed document', () => {
    expect(normalizeAzure('')).toEqual([]);
    expect(normalizeAzure('<rss></rss>')).toEqual([]);
  });
});

describe('isRetirement', () => {
  it('trusts the category first', () => {
    expect(isRetirement({ title: 'Anything', description: '', categories: ['Retirements'] })).toBe(true);
  });

  it('catches a retirement filed under a product category only', () => {
    expect(isRetirement({ title: 'X will be retired soon', description: '', categories: ['Compute'] }))
      .toBe(true);
    expect(isRetirement({ title: 'Deprecating the old API', description: '', categories: [] })).toBe(true);
  });

  it('does not fire on ordinary news', () => {
    expect(isRetirement({ title: 'Generally available: faster disks', description: 'Now GA.', categories: ['Storage'] }))
      .toBe(false);
  });
});

describe('rss helpers', () => {
  it('decodes the entities the feed emits', () => {
    expect(decodeEntities('AT&amp;T &lt;b&gt; &quot;x&quot; &#39;y&#39;')).toBe('AT&T <b> "x" \'y\'');
  });

  it('strips CDATA and tags and collapses whitespace', () => {
    expect(stripMarkup('<![CDATA[<p>hello   there</p>]]>')).toBe('hello there');
  });

  it('reads guid, title, link, categories and pubDate', () => {
    const [item] = parseRss(rss(azureItem()));
    expect(item.guid).toBe('567979');
    expect(item.categories).toEqual(['Retirements', 'Compute']);
    expect(item.pubDate).toBe('Thu, 06 Aug 2026 16:40:19 Z');
  });

  it('returns an empty list rather than throwing on junk', () => {
    expect(parseRss('')).toEqual([]);
    expect(parseRss(null)).toEqual([]);
  });
});
