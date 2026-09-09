// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { http, HttpResponse } from 'msw';
import { posApiBase } from '../../lib/urls';
import {
  makeAuthResponse,
  makeCatalogItem,
  makeSaleDetail,
  makeSaleListItem,
  makeTag,
} from '../utils';

/**
 * With `VITE_API_BASE` blank (see `vitest.config.ts`) this is the relative
 * `/api/pos`, which msw/node resolves against `http://localhost`.
 */
const base = posApiBase();
const url = (path: string) => `${base}${path}`;

function requireBearer(request: Request): boolean {
  return request.headers.get('Authorization')?.startsWith('Bearer ') ?? false;
}

/** Default ПРРО settings: off, no adapter — what every store looks like today. */
export const fiscalSettingsFixture = {
  enabled: false,
  provider: null,
  config: {},
  secrets_set: [],
  default_tax_code: null,
  auto_open_shift: true,
  fail_mode: 'block',
  receipt_source: 'local',
  receipt_width: 32,
  updated_at: null,
  secrets_key_configured: true,
  adapter_available: false,
};

export const handlers = [
  http.get(url('/fiscal/settings'), () => HttpResponse.json(fiscalSettingsFixture)),

  http.patch(url('/fiscal/settings'), async ({ request }) => {
    const patch = (await request.json()) as Record<string, unknown>;
    // Mirrors the server: the PATCH response carries no `adapter_available`.
    const { adapter_available: _omit, ...rest } = fiscalSettingsFixture;
    return HttpResponse.json({ ...rest, ...patch });
  }),

  http.post(url('/sales/complete'), () => HttpResponse.json(makeSaleDetail(), { status: 201 })),

  http.post(url('/auth/owner/login'), async ({ request }) => {
    const body = (await request.json()) as { login?: string; password?: string };
    if (!body.password) {
      return HttpResponse.json({ error: 'Невірний логін або пароль' }, { status: 401 });
    }
    return HttpResponse.json(makeAuthResponse());
  }),

  http.post(url('/auth/staff/pin'), async ({ request }) => {
    const body = (await request.json()) as { store_slug?: string; pin?: string };
    if (body.pin !== '1234') {
      return HttpResponse.json({ error: 'Невірний PIN' }, { status: 401 });
    }
    return HttpResponse.json(
      makeAuthResponse({ staff: { id: 2, display_name: 'Ігор', role: 'seller' } })
    );
  }),

  http.post(url('/auth/logout'), () => HttpResponse.json({ ok: true })),

  http.get(url('/me'), ({ request }) => {
    if (!requireBearer(request)) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return HttpResponse.json(makeAuthResponse());
  }),

  http.get(url('/catalog'), () => HttpResponse.json([makeCatalogItem()])),

  http.get(url('/tags'), () => HttpResponse.json([makeTag()])),

  http.get(url('/customers'), () => HttpResponse.json([])),

  http.get(url('/store'), () => HttpResponse.json({ enabled_modules: [] })),

  http.get(url('/sales'), () => HttpResponse.json([makeSaleListItem()])),

  http.get(url('/sales/:id'), ({ params }) =>
    HttpResponse.json(makeSaleDetail({ id: Number(params.id) }))
  ),

  http.post(url('/sales/:id/refunds'), ({ params }) =>
    HttpResponse.json(makeSaleDetail({ id: Number(params.id), status: 'refunded' }))
  ),
];
