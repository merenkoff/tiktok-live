import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ALL_MODULES, loginAsOwner, mockPosApi } from './helpers';
import { hasPrivateModule } from './_private';

// `tiktok-live` is an online-only module whose source moves to a private repo
// (POS_OPENCORE.md §5, O-2); run this spec only where that source is present.
test.skip(() => !hasPrivateModule('tiktok-live'), 'tiktok-live: private module (POS_OPENCORE §5)');

/**
 * «Прямий ефір» end to end in the web shell: the REAL signed `tiktok-live`
 * bundle served from a fake CDN, a store that names it in `module_remotes`,
 * and the two backends it talks to mocked here —
 *
 *   POS:  POST /api/pos/live/session-token (the one POS→LIVE bridge),
 *         GET/PUT /api/pos/live/settings, POST …/test-telegram;
 *   LIVE: /api/sessions/{current,start,stop,logs} with the bridged token as a
 *         Bearer, and the log stream over a WebSocket (`?token=` in the URL).
 *
 * What it holds: the desk mints a LIVE token through the bridge and every LIVE
 * call carries it; a broadcast starts and stops; a comment pushed down the
 * socket lands in «Стрічка ефіру» and in the counters; the owner's settings go
 * out as one PUT and the bot token is never echoed back; a store with no TikTok
 * account says so in words; and with the CDN down nothing of the module is left.
 */

const CDN = 'https://cdn.e2e.test/tiktok-live';
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist-remotes/tiktok-live');

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.sig': 'text/plain',
};

const LIVE_REMOTE = {
  url: `${CDN}/remote-entry.js`,
  title: 'Прямий ефір',
  routePath: '/live',
  icon: 'Video',
  nav: [{ label: 'Ефір', location: 'cashier-primary', order: 85, icon: 'Video', match: '/live' }],
};

const LIVE_TOKEN = 'live-e2e-token';

type Sent = { method: string; path: string; auth?: string; body?: unknown };

async function serveBuiltRemote(page: Page, { down = false } = {}) {
  await page.route(`${CDN}/**`, async (route) => {
    if (down) return route.fulfill({ status: 404, body: 'not found' });
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    try {
      const body = readFileSync(path.join(DIST, name));
      await route.fulfill({
        body,
        contentType: CONTENT_TYPES[path.extname(name)] ?? 'application/octet-stream',
        headers: { 'access-control-allow-origin': '*' },
      });
    } catch {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  });
}

/**
 * The POS bridge and the LIVE API, one object of state. Registered AFTER
 * `mockPosApi`, whose catch-all would otherwise answer the POS half.
 */
async function mockLive(page: Page, { configured = true } = {}) {
  const sent: Sent[] = [];
  const state = {
    running: false,
    settings: {
      user_id: 7,
      tiktok_username: 'demo_shop',
      telegram_bot_token_set: false,
      telegram_channel_id: null as string | null,
      novaposhta_api_key_set: false,
      novaposhta_merchant_name: null as string | null,
      reservation_timeout_minutes: 30,
    },
  };
  const session = () => ({
    id: 11,
    user_id: 7,
    status: state.running ? 'running' : 'stopped',
    started_at: state.running ? new Date(Date.now() - 65_000).toISOString() : null,
    stopped_at: null,
  });

  await page.route('**/api/pos/live/session-token', (route) => {
    sent.push({ method: 'POST', path: '/live/session-token' });
    if (!configured) return route.fulfill({ status: 409, json: { error: 'live_not_configured' } });
    return route.fulfill({
      json: {
        token: LIVE_TOKEN,
        user: { id: 7, tiktok_username: 'demo_shop' },
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      },
    });
  });
  await page.route('**/api/pos/live/settings', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      sent.push({ method: 'PUT', path: '/live/settings', body });
      if (typeof body.telegram_bot_token === 'string') state.settings.telegram_bot_token_set = true;
      if ('telegram_channel_id' in body) state.settings.telegram_channel_id = (body.telegram_channel_id as string | null) ?? null;
    }
    await route.fulfill({ json: state.settings });
  });
  await page.route('**/api/pos/live/settings/test-telegram', (route) => {
    sent.push({ method: 'POST', path: '/live/settings/test-telegram' });
    return route.fulfill({ json: { ok: true, username: 'demo_shop_bot' } });
  });

  await page.route('**/api/sessions/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-allow-methods': 'GET, POST',
        },
      });
    }
    const { pathname } = new URL(req.url());
    const p = pathname.replace(/^.*\/api\/sessions/, '');
    sent.push({ method: req.method(), path: `/sessions${p}`, auth: req.headers()['authorization'] });
    const cors = { 'access-control-allow-origin': '*' };
    if (p === '/current') return route.fulfill({ json: state.running ? session() : null, headers: cors });
    if (p === '/start') {
      state.running = true;
      return route.fulfill({ json: session(), headers: cors });
    }
    if (p === '/stop') {
      state.running = false;
      return route.fulfill({ json: { success: true }, headers: cors });
    }
    if (p === '/logs') return route.fulfill({ json: [], headers: cors });
    return route.fulfill({ status: 404, json: { error: 'not found' }, headers: cors });
  });

  return sent;
}

async function signIn(page: Page, opts: { down?: boolean; configured?: boolean } = {}) {
  await serveBuiltRemote(page, { down: opts.down ?? false });
  await mockPosApi(page, ALL_MODULES, { moduleRemotes: { 'tiktok-live': LIVE_REMOTE } });
  const sent = await mockLive(page, { configured: opts.configured ?? true });
  await loginAsOwner(page);
  // The first login only records the store's module list; it applies on the
  // next boot, same as every other remote.
  await page.reload();
  await page.waitForURL(/\/admin$/);
  return sent;
}

test('the desk: the bridged token on every LIVE call, start, a comment down the socket, stop', async ({ page }) => {
  const socketUrls: string[] = [];
  await page.routeWebSocket('**/api/sessions/logs/stream**', (ws) => {
    socketUrls.push(ws.url());
    // A comment arrives a moment after the stream opens.
    setTimeout(() => {
      ws.send(
        JSON.stringify({
          type: 'log',
          log: {
            id: 1,
            session_id: 11,
            user_id: 7,
            log_type: 'tiktok_comment',
            message: 'олена_к: беру сукню M',
            created_at: new Date().toISOString(),
          },
        })
      );
    }, 200);
  });
  const sent = await signIn(page);

  await page.goto('/live');
  await expect(page.getByRole('heading', { name: 'Прямий ефір' })).toBeVisible();
  await expect(page.getByTestId('session-status')).toContainText('Зупинена');

  await page.getByTestId('session-start').click();
  await expect(page.getByTestId('session-status')).toContainText('Активна');
  await expect(page.getByTestId('session-stop')).toBeVisible();

  await expect(page.getByText('олена_к: беру сукню M')).toBeVisible();
  expect(socketUrls.some((u) => u.includes(`token=${LIVE_TOKEN}`))).toBe(true);

  await page.getByTestId('session-stop').click();
  await expect(page.getByTestId('session-status')).toContainText('Зупинена');

  // One mint through the bridge; every LIVE call carries its token.
  expect(sent.filter((s) => s.path === '/live/session-token').length).toBeGreaterThanOrEqual(1);
  const liveCalls = sent.filter((s) => s.path.startsWith('/sessions'));
  expect(liveCalls.map((s) => s.path)).toEqual(expect.arrayContaining(['/sessions/start', '/sessions/stop']));
  for (const call of liveCalls) expect(call.auth).toBe(`Bearer ${LIVE_TOKEN}`);
});

test('the owner’s settings go out as one PUT, and the bot token is never echoed', async ({ page }) => {
  const sent = await signIn(page);

  await page.getByRole('link', { name: 'Прямий ефір' }).first().click();
  await page.waitForURL(/\/admin\/live$/);
  await expect(page.getByText('@demo_shop')).toBeVisible();

  await page.getByLabel(/Токен бота/).fill('123456:ABC-DEF');
  await page.getByLabel(/ID каналу/).fill('-1001234567890');
  await page.getByRole('button', { name: 'Зберегти' }).click();

  await expect
    .poll(() => sent.find((s) => s.path === '/live/settings' && s.method === 'PUT')?.body)
    .toMatchObject({ telegram_bot_token: '123456:ABC-DEF', telegram_channel_id: '-1001234567890' });
  await expect(page.getByText('Збережено. Введіть новий, щоб замінити — порожнє поле лишає поточний.')).toBeVisible();
  await expect(page.getByLabel(/Токен бота/)).toHaveValue('');

  await page.getByRole('button', { name: 'Перевірити зʼєднання' }).click();
  await expect(page.getByText('Бот працює — @demo_shop_bot')).toBeVisible();
});

test('a store with no TikTok account is told so, in words', async ({ page }) => {
  await signIn(page, { configured: false });
  await page.goto('/live');
  await expect(page.getByText('Магазин не під’єднано до TikTok LIVE')).toBeVisible();
});

test('with the module CDN down nothing of the module is left behind', async ({ page }) => {
  await signIn(page, { down: true });
  await expect(page.getByRole('link', { name: 'Прямий ефір' })).toHaveCount(0);
  await page.goto('/register');
  await expect(page.getByRole('link', { name: 'Ефір' })).toHaveCount(0);
});
