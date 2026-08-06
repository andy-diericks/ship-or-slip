import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves this repo at /ship-or-slip/, but `npm run dev` and
// `vite preview` serve from the root. GITHUB_PAGES is set by the deploy
// workflow so the two never have to be reconciled by hand.
const base = process.env.GITHUB_PAGES === 'true' ? '/ship-or-slip/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
  },
});
