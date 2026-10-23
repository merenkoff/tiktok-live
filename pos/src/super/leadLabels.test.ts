// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { STATUS_LABEL, STATUS_ORDER, formLabel, intentLabel, interestLabel } from './leadLabels';

describe('lead labels', () => {
  it('names every status the server has, in pipeline order', () => {
    expect(STATUS_ORDER).toEqual(['new', 'contacted', 'demo', 'client', 'lost']);
    expect(STATUS_ORDER.map((s) => STATUS_LABEL[s])).toEqual(['Нові', 'Зв’язались', 'Демо', 'Клієнт', 'Відмова']);
  });

  it('shows an id the tab does not know as it is, never as nothing', () => {
    expect(interestLabel('kafe')).toBe('Кафе');
    expect(interestLabel('barbershop')).toBe('barbershop');
    expect(interestLabel(null)).toBe('—');
    expect(intentLabel('waitlist')).toBe('Лист очікування');
    expect(intentLabel('new-intent')).toBe('new-intent');
  });

  it('reads the form ids the site sends', () => {
    expect(formLabel('dovidka:kavapp-chy-liveshop-dlya-kavyarni')).toBe('Довідка: kavapp-chy-liveshop-dlya-kavyarni');
    expect(formLabel('unknown')).toBe('Стара форма');
    expect(formLabel('imported')).toBe('Перенесено зі старої таблиці');
    expect(formLabel('vertical-kafe')).toBe('vertical-kafe');
  });
});
