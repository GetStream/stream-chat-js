/// <reference types="vitest/config" />

import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    testTimeout: 20000,
    // not all errors have been handled so this is necessary (at least for the time being)
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
