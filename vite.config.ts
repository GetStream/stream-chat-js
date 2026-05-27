/// <reference types="vitest/config" />

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 20000,
    // not all errors have been handled so this is necessary (at least for the time being)
    dangerouslyIgnoreUnhandledErrors: true,
    include: ['./test/unit/**/*.test.[jt]s'],
    // Vitest 4 no longer auto-reuses a fresh spy on each `vi.spyOn` call on the same
    // target -- spies persist across tests and call counts accumulate. Restoring all
    // mocks before each test brings back the vitest 3 / Jest convention these tests
    // were written against.
    restoreMocks: true,
  },
});
