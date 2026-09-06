// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Scope the root suite to the backend. Without this, vitest's default glob
    // also picks up admin/ and pos/ — two SPA suites that need jsdom and their
    // own configs, and that fail outright when run from here.
    include: ['src/__tests__/**/*.test.ts'],
    globalSetup: ['./vitest.global-setup.ts'],
    // DB-backed suites talk to a real Postgres; give the slowest room.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
