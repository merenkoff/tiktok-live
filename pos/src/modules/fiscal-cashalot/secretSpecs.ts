// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-cashalot/secretSpecs.ts
//
// Cashalot's three credentials, exactly as the adapter declares them
// (`src/pos/fiscal/providers/cashalot/index.ts` `secretKeys`): there is no
// session or token — every request carries the key id, the cashier's PIN and
// the register's fiscal number, so all three are required before the first
// call. Declared statically for the reason `fiscal-checkbox/secretSpecs.ts`
// gives: `secretKeys` is backend-internal, no route exposes it, and the
// adapter's own test (`pos.fiscal.cashalot.provider.test.ts`) pins the same
// three keys so the two cannot drift apart silently.

import type { FiscalSecretKeySpec } from '../fiscal-core/types';

const HINT = 'Кабінет Cashalot → Налаштування → Інтеграція з WEB API → Управління касирами';

export const CASHALOT_SECRET_SPECS: readonly FiscalSecretKeySpec[] = [
  {
    key: 'keyGuid',
    label: 'Ідентифікатор ключа (KeyGuid)',
    required: true,
    kind: 'password',
    hint: HINT,
  },
  {
    key: 'keyPin',
    label: 'PIN касира',
    required: true,
    kind: 'password',
    hint: HINT,
  },
  {
    key: 'numFiscal',
    label: 'Фіскальний номер ПРРО',
    required: true,
    kind: 'text',
    hint: 'Кабінет Cashalot → Каси → обраний ПРРО',
  },
];
