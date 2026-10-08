import { defineConfig } from 'vitest/config';

// `yarn test-docs-sync`: compares the test snippet regions with the docs fences.
// No network and no credentials needed.
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['./sync/**/*.test.ts'],
    reporters: ['verbose'],
  },
});
