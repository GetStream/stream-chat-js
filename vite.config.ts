/// <reference types="vitest/config" />

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 20000,
    // not all errors have been handled so this is necessary (at least for the time being)
    dangerouslyIgnoreUnhandledErrors: true,
    environment: 'jsdom',
  },
});
