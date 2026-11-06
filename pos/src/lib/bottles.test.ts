// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  bottleOfUid,
  bottleStampLines,
  bottleNeededText,
  bottlesMissingStamps,
  mergeNeeded,
  openBottlesField,
  readNeededBottles,
  setBottleStamps,
} from './bottles';

const vodka = { variant_id: 7, product_name: 'Горілка · 500 мл', count: 1 };
const cognac = { variant_id: 9, product_name: 'Коньяк · 700 мл', count: 2 };

describe('the new bottles on the stamps sheet (ДК5)', () => {
  it('draws a line per bottle with the stamps scanned for it, never mixing variants', () => {
    const lines = bottleStampLines([vodka, cognac], [
      { variant_id: 9, excise_label: 'AATE 000001' },
      { variant_id: 7, excise_label: 'AATE 000002' },
    ]);
    expect(lines).toEqual([
      {
        uid: 'bottle:7',
        product_name: 'Нова пляшка: Горілка · 500 мл',
        quantity: 1,
        excise_per_unit: true,
        excise_labels: ['AATE 000002'],
      },
      {
        uid: 'bottle:9',
        product_name: 'Нова пляшка: Коньяк · 700 мл',
        quantity: 2,
        excise_per_unit: true,
        excise_labels: ['AATE 000001'],
      },
    ]);
  });

  it('tells a bottle’s line from a cart line by its uid', () => {
    expect(bottleOfUid('bottle:7')).toBe(7);
    expect(bottleOfUid('7')).toBeNull();
    expect(bottleOfUid('bottle:x')).toBeNull();
    expect(bottleOfUid('weighed:abc')).toBeNull();
  });

  it('replaces one bottle’s stamps and keeps the others', () => {
    const stamps = [
      { variant_id: 7, excise_label: 'AATE 000002' },
      { variant_id: 9, excise_label: 'AATE 000001' },
    ];
    expect(setBottleStamps(stamps, 9, ['AATE 000001', 'AATE 000003'])).toEqual([
      { variant_id: 7, excise_label: 'AATE 000002' },
      { variant_id: 9, excise_label: 'AATE 000001' },
      { variant_id: 9, excise_label: 'AATE 000003' },
    ]);
    expect(setBottleStamps(stamps, 7, [])).toEqual([{ variant_id: 9, excise_label: 'AATE 000001' }]);
  });

  it('asks again for what was scanned plus what the server still lacks', () => {
    const stamps = [{ variant_id: 7, excise_label: 'AATE 000002' }];
    // The server spent the vodka stamp and now names a second vodka bottle and the cognac.
    expect(mergeNeeded([vodka], stamps, [{ ...vodka, count: 1 }, cognac])).toEqual([
      { ...vodka, count: 2 },
      cognac,
    ]);
    // A bottle no longer named keeps only the stamps already scanned for it.
    expect(mergeNeeded([vodka, cognac], stamps, [cognac])).toEqual([{ ...vodka, count: 1 }, cognac]);
  });

  it('counts the stamps still missing before payment', () => {
    expect(bottlesMissingStamps([], [])).toBe(0);
    expect(bottlesMissingStamps([vodka, cognac], [{ variant_id: 9, excise_label: 'AATE 000001' }])).toBe(2);
  });

  it('sends `open_bottles` only when there is a stamp', () => {
    expect(openBottlesField([])).toEqual({});
    expect(openBottlesField([{ variant_id: 7, excise_label: 'AATE 000002' }])).toEqual({
      open_bottles: [{ variant_id: 7, excise_label: 'AATE 000002' }],
    });
  });

  it('reads the refusal’s list defensively', () => {
    expect(readNeededBottles(undefined)).toEqual([]);
    expect(readNeededBottles([vodka, { variant_id: 0, count: 1 }, { variant_id: 3, count: 0 }, null])).toEqual([vodka]);
    expect(readNeededBottles([{ variant_id: 3, count: 1 }])).toEqual([
      { variant_id: 3, product_name: 'Пляшка', count: 1 },
    ]);
  });

  it('says which bottles to open in the server’s own words', () => {
    expect(bottleNeededText([vodka])).toBe('Відкрийте нову пляшку: «Горілка · 500 мл» — скануйте її акцизну марку');
    expect(bottleNeededText([vodka, cognac])).toBe(
      'Відкрийте нову пляшку: «Горілка · 500 мл», «Коньяк · 700 мл» — 2 пляшки — скануйте її акцизну марку'
    );
  });
});
