import { describe, it, expect } from 'vitest';
import { featureId, sourceLink } from './links.mjs';

describe('featureId', () => {
  it('strips our namespace, leaving the id Microsoft uses', () => {
    expect(featureId('m365:558683')).toBe('558683');
    expect(featureId('azure:567979')).toBe('567979');
  });

  it('passes through an id that carries no namespace', () => {
    expect(featureId('558683')).toBe('558683');
  });

  it('handles missing input', () => {
    expect(featureId(null)).toBe('');
    expect(featureId(undefined)).toBe('');
  });
});

describe('sourceLink', () => {
  it('uses searchterms for the M365 roadmap, not featureid', () => {
    // ?featureid= loads the roadmap but does not select the feature. Both
    // return HTTP 200 because the page is client-rendered, so this was
    // established by hand rather than by status code.
    expect(sourceLink('m365:558683', 'm365'))
      .toBe('https://www.microsoft.com/microsoft-365/roadmap?searchterms=558683');
  });

  it('carries no locale — microsoft.com redirects to the reader\'s own', () => {
    expect(sourceLink('m365:558683', 'm365')).not.toMatch(/\/(en-us|fr-be)\//);
  });

  it('links Azure updates by id', () => {
    expect(sourceLink('azure:567979', 'azure'))
      .toBe('https://azure.microsoft.com/updates?id=567979');
  });

  it('infers the source from the id when not given', () => {
    expect(sourceLink('azure:567979')).toContain('azure.microsoft.com');
    expect(sourceLink('m365:1')).toContain('microsoft-365/roadmap');
  });

  it('falls back to the roadmap index rather than a broken URL', () => {
    expect(sourceLink('')).toBe('https://www.microsoft.com/microsoft-365/roadmap');
    expect(sourceLink(null)).toBe('https://www.microsoft.com/microsoft-365/roadmap');
  });

  it('encodes anything unexpected in an id', () => {
    expect(sourceLink('m365:a b&c', 'm365')).toContain('searchterms=a%20b%26c');
  });
});
