// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The `fiscal-cashalot` bundle keeps its own copy of the letter → ASCII-code
// table (`pos/src/modules/fiscal-cashalot/lib/taxTable.ts`): the form turns
// the chosen row into `default_tax_code` with it, and the server resolves
// that code back to a letter with `dps/taxes.ts`. The two tables must be the
// same table — this test is what notices when one is edited without the
// other, the way `pos.public-menu.dishfacts.test.ts` guards the allergens.

import { describe, expect, it } from 'vitest';
import { letterCode } from '../pos/fiscal/dps/index.js';
import { CASHALOT_LETTER_CODES } from '../../pos/src/modules/fiscal-cashalot/lib/taxTable.js';

describe('Cashalot tax letters — client copy vs dps/taxes.ts', () => {
  it('maps every letter the client offers to the code the server resolves', () => {
    expect(Object.keys(CASHALOT_LETTER_CODES)).toHaveLength(14);
    for (const [letter, code] of Object.entries(CASHALOT_LETTER_CODES)) {
      expect(letterCode(letter), letter).toBe(code);
    }
  });
});
