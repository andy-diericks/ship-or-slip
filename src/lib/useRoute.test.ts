import { describe, it, expect } from 'vitest';
import { parseHash } from './useRoute';

describe('parseHash', () => {
  it('treats an empty hash as the feed', () => {
    expect(parseHash('')).toEqual({ name: 'feed', id: '', query: '' });
    expect(parseHash('#/')).toEqual({ name: 'feed', id: '', query: '' });
  });

  it('keeps the query string off the feed route', () => {
    expect(parseHash('#/?q=teams&type=slipped')).toEqual({
      name: 'feed',
      id: '',
      query: 'q=teams&type=slipped',
    });
  });

  it('reads an item route', () => {
    expect(parseHash('#/item/m365:568792')).toEqual({
      name: 'item',
      id: 'm365:568792',
      query: '',
    });
  });

  it('decodes an encoded id', () => {
    expect(parseHash('#/item/m365%3A568792').id).toBe('m365:568792');
  });

  it('falls back to the feed for an unknown path', () => {
    expect(parseHash('#/nowhere').name).toBe('feed');
  });
});
