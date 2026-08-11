# Admin testing

## Stack

- **Unit / integration:** Vitest + jsdom + Testing Library + MSW
- **E2E:** Playwright (Chromium) against `vite preview` with route mocks
- **Coverage gates:** `src/services/**` and `src/hooks/**` (lines/functions/statements ≥ 80%, branches ≥ 70%)

## Commands

```bash
cd admin
npm test                 # vitest run
npm run test:watch       # watch mode
npm run test:coverage    # vitest + coverage thresholds
npm run test:e2e:install # once: install Chromium
npm run test:e2e         # Playwright smoke
```

From repo root:

```bash
npm run test:admin
npm run test:admin:coverage
```

## What is P0

1. Auth hydrate via `/api/auth/me`
2. Soft 401 on `/me` (no hard redirect loop) vs hard 401 on session/settings
3. Login / logout / clearAuth
4. Session start/stop + `isActive`
5. WebSocket connect / disconnect / reconnect

## Mocking notes

- HTTP: MSW handlers in `src/test/msw/handlers.ts` (unit) and `e2e/helpers.ts` (Playwright `page.route`)
- WebSocket: class mock in unit tests; `page.addInitScript` FakeWebSocket in e2e (no live TikTok)
- Always wrap React Query hooks with `createTestQueryClient()` (`retry: false`)

## CI

GitHub Action `.github/workflows/admin-tests.yml` runs unit tests with coverage on PRs and pushes to `main`.
