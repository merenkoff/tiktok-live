// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What a row of the desktop's queue says about itself.

import { describe, expect, it } from 'vitest';
import { queueStatusText } from './queueText';

describe('queueStatusText', () => {
  it('says a written-down handover waits for the network, whatever the last try said', () => {
    expect(queueStatusText({ status: 'queued', attempts: 0 })).toBe('Чекає мережі');
    expect(queueStatusText({ status: 'queued', attempts: 0, lastError: 'Немає звʼязку' })).toBe('Чекає мережі');
  });

  it('says a failed send will be tried again by the till itself', () => {
    expect(queueStatusText({ status: 'error', attempts: 2, lastError: 'Сервер зайнятий' })).toBe(
      'Не вдалося надіслати: Сервер зайнятий. Каса спробує ще раз сама.'
    );
  });

  it('gives a refusal in the server’s own words, and an exhausted row with its count', () => {
    expect(
      queueStatusText({ status: 'dead', attempts: 1, deadReason: 'rejected', lastError: 'Покупця не знайдено' })
    ).toBe('Сервер не прийняв: Покупця не знайдено');
    expect(
      queueStatusText({ status: 'dead', attempts: 8, deadReason: 'attempts_exhausted', lastError: 'Помилка 500' })
    ).toBe('Не вдалося надіслати після 8 спроб: Помилка 500');
    expect(queueStatusText({ status: 'dead', attempts: 1, deadReason: 'rejected' })).toBe(
      'Сервер не прийняв: невідома помилка'
    );
  });
});
