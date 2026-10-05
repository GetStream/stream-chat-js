import { defineConfig } from 'vitest/config';

// Runs the docs snippet tests against a real Stream app (credentials in ./.env).
// Separate from the unit test config so `yarn test` never hits the network.
export default defineConfig({
  test: {
    root: __dirname,
    include: ['./client/**/*.test.ts', './server/**/*.test.ts'],
    setupFiles: ['./setup.ts'],
    // Shows console output (leak / drift warnings) for passing tests too.
    reporters: ['verbose'],
    // Generous because some app-level changes are eventually consistent: a new channel
    // type can take ~30s to become usable, and cleanup waits for background delete tasks.
    testTimeout: 90000,
    hookTimeout: 180000,
    // All files share one app: run them one at a time to stay clear of rate limits.
    fileParallelism: false,
  },
});
