import { useCallback, useEffect, useState } from 'react';

/**
 * Hash routing, because GitHub Pages has no server to rewrite paths and a
 * refresh on a deep link must not 404. The routes:
 *
 *   #/            the feed, with filters in the query string
 *   #/item/<id>   one feature's date history
 *   #/overdue     everything past its promised date
 *   #/contradictions  items whose own record disagrees with itself
 *   #/health      whether the pipeline itself is working
 *   #/contracts   api-version contract changes, and what the docs do not say
 */
export interface Route {
  name: 'feed' | 'item' | 'overdue' | 'contradictions' | 'health' | 'contracts';
  id: string;
  query: string;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [path = '/', query = ''] = raw.split('?');
  const item = path.match(/^\/item\/(.+)$/);
  if (item?.[1]) return { name: 'item', id: decodeURIComponent(item[1]), query };
  if (path === '/overdue') return { name: 'overdue', id: '', query };
  if (path === '/contradictions') return { name: 'contradictions', id: '', query };
  if (path === '/health') return { name: 'health', id: '', query };
  if (path === '/contracts') return { name: 'contracts', id: '', query };
  return { name: 'feed', id: '', query };
}

export function useRoute(): [Route, (hash: string, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(typeof window === 'undefined' ? '' : window.location.hash),
  );

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((hash: string, replace = false) => {
    const next = hash.startsWith('#') ? hash : `#${hash}`;
    if (next === window.location.hash) return;
    // Filter edits replace rather than push, so Back leaves the page instead of
    // walking through every keystroke of a search.
    if (replace) {
      window.history.replaceState(null, '', next);
      setRoute(parseHash(next));
    } else {
      window.location.hash = next;
    }
  }, []);

  return [route, navigate];
}
