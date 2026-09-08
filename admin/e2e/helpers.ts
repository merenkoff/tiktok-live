import type { Page } from '@playwright/test';

const mockUser = {
  id: 1,
  tiktok_username: 'evelin_kids',
  created_at: '2026-01-01T00:00:00.000Z',
  is_active: true,
  subscription_level: 'free',
};

// Mirrors `UserSettingsView` on the backend: secrets are never sent, only
// whether one is stored, and the channel id is a string (it is a bigint column).
const mockSettings = {
  user_id: 1,
  tiktok_username: 'evelin_kids',
  telegram_bot_token_set: true,
  telegram_channel_id: '-100123',
  novaposhta_api_key_set: false,
  novaposhta_merchant_name: 'Shop',
  reservation_timeout_minutes: 5,
};

export async function mockApi(page: Page) {
  let session: Record<string, unknown> | null = null;

  await page.route('**/api/auth/login', async (route) => {
    const body = route.request().postDataJSON() as { tiktok_username?: string };
    await route.fulfill({
      json: {
        token: 'e2e-token',
        user: { ...mockUser, tiktok_username: body.tiktok_username || 'evelin_kids' },
      },
    });
  });

  await page.route('**/api/auth/logout', async (route) => {
    await route.fulfill({ json: { ok: true } });
  });

  await page.route('**/api/auth/me', async (route) => {
    const auth = route.request().headers()['authorization'];
    if (!auth?.startsWith('Bearer ')) {
      await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
      return;
    }
    await route.fulfill({ json: mockUser });
  });

  await page.route('**/api/settings', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: mockSettings });
      return;
    }
    // The real PUT answers with the same secret-free view, not an echo of the
    // patch — spreading the body back would reintroduce the shape this API
    // deliberately stopped returning.
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      json: {
        ...mockSettings,
        telegram_channel_id: (body.telegram_channel_id as string | null) ?? null,
        novaposhta_merchant_name: (body.novaposhta_merchant_name as string | null) ?? null,
        reservation_timeout_minutes:
          (body.reservation_timeout_minutes as number) ?? mockSettings.reservation_timeout_minutes,
      },
    });
  });

  await page.route('**/api/settings/test-telegram', async (route) => {
    await route.fulfill({ json: { ok: true, message: 'Telegram bot is working' } });
  });

  await page.route('**/api/sessions/current', async (route) => {
    await route.fulfill({ json: session });
  });

  await page.route('**/api/sessions/start', async (route) => {
    session = {
      id: 10,
      user_id: 1,
      status: 'running',
      started_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    await route.fulfill({ json: session });
  });

  await page.route('**/api/sessions/stop', async (route) => {
    session = null;
    await route.fulfill({ json: { success: true } });
  });

  await page.route('**/api/sessions/logs**', async (route) => {
    await route.fulfill({
      json: [
        {
          id: 1,
          session_id: 10,
          user_id: 1,
          log_type: 'info',
          message: 'E2E log line',
          created_at: new Date().toISOString(),
        },
      ],
    });
  });
}

export async function mockWebSocket(page: Page) {
  await page.addInitScript(() => {
    class FakeWebSocket {
      static OPEN = 1;
      static CONNECTING = 0;
      static CLOSED = 3;
      readyState = FakeWebSocket.CONNECTING;
      onopen: ((ev?: Event) => void) | null = null;
      onclose: ((ev?: CloseEvent) => void) | null = null;
      onerror: ((ev?: Event) => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      constructor(public url: string) {
        setTimeout(() => {
          this.readyState = FakeWebSocket.OPEN;
          this.onopen?.(new Event('open'));
        }, 0);
      }
      send() {}
      close() {
        this.readyState = FakeWebSocket.CLOSED;
      }
    }
    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      writable: true,
      value: FakeWebSocket,
    });
  });
}

/**
 * Put the app in a signed-in state.
 *
 * The login screen is retired (`POST /api/auth/login` was removed — it
 * authenticated on a public nickname alone), so these suites seed the token the
 * way a returning visit would have it and let `loadUser` hydrate from storage.
 * The screens under test are unchanged; only the way in is.
 */
export async function signIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'e2e-token');
    localStorage.setItem('user', JSON.stringify({ id: 1, tiktok_username: 'evelin_kids' }));
  });
}
