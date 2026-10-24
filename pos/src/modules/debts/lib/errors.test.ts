// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A refused write, read off the server's answer: its own sentence, its code,
// the debt as it stands — and «nothing came back», which is the one case where
// the same key must be sent again.

import { describe, expect, it } from 'vitest';
import { debtFailure } from './errors';

describe('debtFailure', () => {
  it('prints the server’s sentence and keeps the figures beside a limit refusal', () => {
    const failure = debtFailure(
      {
        response: {
          status: 409,
          data: {
            error: 'Понад ліміт: борг 64,00 ₴ + 45,00 ₴ = 109,00 ₴, ліміт 100,00 ₴.',
            code: 'over_limit',
            balance_cents: 6400,
            attempt_cents: 4500,
            limit_cents: 10000,
            available_cents: 3600,
          },
        },
      },
      'fallback'
    );
    expect(failure).toMatchObject({
      text: 'Понад ліміт: борг 64,00 ₴ + 45,00 ₴ = 109,00 ₴, ліміт 100,00 ₴.',
      code: 'over_limit',
      status: 409,
      unknown: false,
      limit: { balance: 6400, attempt: 4500, limit: 10000, available: 3600 },
    });
  });

  it('carries the debt a ПРРО refusal answered with, and that the receipt was undone', () => {
    const failure = debtFailure(
      {
        response: {
          status: 502,
          data: {
            error: 'ПРРО відхилило чек. Чек погашення скасовано, товари знову в борг.',
            code: 'rejected',
            sale_voided: true,
            credit: { customer_id: 7, balance_cents: 6400 },
            open_lines: [{ id: 1 }],
          },
        },
      },
      'fallback'
    );
    expect(failure.saleVoided).toBe(true);
    expect(failure.credit).toMatchObject({ balance_cents: 6400 });
    expect(failure.openLines).toHaveLength(1);
  });

  it('says «no answer» when nothing came back — the same key must be sent again', () => {
    const failure = debtFailure(new Error('timeout of 15000ms exceeded'), 'fallback');
    expect(failure.unknown).toBe(true);
    expect(failure.status).toBeNull();
    expect(failure.text).toContain('Немає звʼязку');
  });

  it('falls back to the caller’s words for a bare status', () => {
    expect(debtFailure({ response: { status: 500, data: {} } }, 'Не вдалося').text).toBe('Не вдалося');
  });
});
