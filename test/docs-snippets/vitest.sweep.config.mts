import { defineConfig } from 'vitest/config';

// `yarn test-docs-sweep`: removes docs-test leftovers from the app (see maintenance/sweep.ts).
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['./maintenance/sweep.ts'],
    setupFiles: ['./setup.ts'],
    // Shows console output (leak / drift warnings) for passing tests too.
    reporters: ['verbose'],
    testTimeout: 600000,
    hookTimeout: 180000,
  },
});
