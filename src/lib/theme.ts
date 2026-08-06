import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'ship-or-slip:theme';

/** The OS preference, used until the reader expresses one of their own. */
function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    // Private browsing and blocked storage both land here; fall back to the OS.
    return null;
  }
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Follow the OS while the reader has not chosen for themselves.
  useEffect(() => {
    if (storedTheme() || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setTheme(storedTheme() ?? systemTheme());
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Not being able to remember the choice is not a reason to refuse it.
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}
