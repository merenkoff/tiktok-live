import type { Page } from '@playwright/test';

const mockUser = {
  id: 1,
  tiktok_username: 'evelin_kids',
  created_at: '2026-01-01T00:00:00.000Z',
  is_active: true,
  subscription_level: 'free',
};

const mockSettings = {
  id: 1,
  user_id: 1,
  telegram_bot_token: 'bot-token',
  telegram_channel_id: -100123,
  novaposhta_api_key: '',
  novaposhta_merchant_name: 'Shop',
  tiktok_username: 'evelin_kids',
  reservation_timeout_minutes: 5,
  payment_timeout_minutes: 10,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
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
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: { ...mockSettings, ...body } });
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
