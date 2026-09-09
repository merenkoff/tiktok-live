// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-checkbox/secretSpecs.ts
//
// Checkbox's two credentials, confirmed against the public OpenAPI spec
// (api.checkbox.in.ua/api/openapi.json) in TechDocs/POS_FISCAL_PRRO.md §3:
// `POST /api/v1/cashier/signinPinCode` takes `pin_code` in the body and
// `X-License-Key` as a header.
//
// Declared statically here, not fetched from `FiscalProvider.secretKeys` on
// the backend — there is no real Checkbox adapter yet (phase 2b), and even
// once there is, `secretKeys` is a backend-internal contract with no route
// exposing it. `fiscal-checkbox` IS the Checkbox-specific UI bundle, so its
// own field list living in its own code is not a genericity break — the
// `SecretsForm` component it feeds stays reusable for whatever the next
// provider bundle declares. A manifest contract test pins these two keys so a
// real adapter's `secretKeys` cannot silently drift from what this form
// collects.

import type { FiscalSecretKeySpec } from '../fiscal-core/types';

export const CHECKBOX_SECRET_SPECS: readonly FiscalSecretKeySpec[] = [
  {
    key: 'licenceKey',
    label: 'Ліцензійний ключ',
    required: true,
    kind: 'password',
    hint: 'Кабінет Checkbox → Каси → обраний реєстратор',
  },
  {
    key: 'cashierPin',
    label: 'PIN-код касира',
    required: true,
    kind: 'password',
    hint: '4–6 цифр, як у кабінеті Checkbox',
  },
];
