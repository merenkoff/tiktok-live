// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-core/components/SecretsForm.tsx
//
// A credentials form generated from a declarative field list
// (`FiscalSecretKeySpec[]`), so no per-provider UI code is needed for the form
// ITSELF — only the list of fields, which lives in each provider bundle
// (`fiscal-checkbox/secretSpecs.ts`) because each bundle IS one provider.
//
// Semantics match `PATCH /fiscal/settings`: a field left blank means "leave
// this credential unchanged" (so a saved licence key survives editing an
// unrelated field), never "clear it". Clearing is a deliberate separate
// action, not a side effect of an empty submit.

import { useState } from 'react';
import type { FiscalSecretKeySpec } from '../types';

export interface SecretsFormProps {
  specs: readonly FiscalSecretKeySpec[];
  /** Which keys already hold a value server-side — from `secrets_set`. */
  secretsSet: readonly string[];
  saving: boolean;
  onSave: (values: Record<string, string | null>) => void;
}

export function SecretsForm({ specs, secretsSet, saving, onSave }: SecretsFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const setField = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function submit() {
    // Only send keys the cashier actually typed into — an untouched field for
    // an already-set credential must not overwrite it with an empty string.
    const changed: Record<string, string | null> = {};
    for (const spec of specs) {
      if (values[spec.key] !== undefined && values[spec.key] !== '') {
        changed[spec.key] = values[spec.key];
      }
    }
    if (Object.keys(changed).length === 0) return;
    onSave(changed);
    setValues({});
  }

  function clearField(key: string) {
    onSave({ [key]: null });
  }

  return (
    <div className="space-y-4">
      {specs.map((spec) => {
        const isSet = secretsSet.includes(spec.key);
        return (
          <div key={spec.key} className="space-y-1.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-sq-secondary">
                {spec.label}
                {spec.required && <span className="text-red-600"> *</span>}
              </span>
              <div className="flex items-center gap-3">
                <input
                  type={spec.kind === 'password' ? 'password' : 'text'}
                  className="sq-input flex-1"
                  value={values[spec.key] ?? ''}
                  onChange={(e) => setField(spec.key, e.target.value)}
                  placeholder={isSet ? '••••••••' : spec.hint}
                  autoComplete="off"
                />
                {isSet && (
                  <button
                    type="button"
                    className="shrink-0 min-h-9 text-[15px] font-semibold text-red-600"
                    onClick={() => clearField(spec.key)}
                  >
                    Очистити
                  </button>
                )}
              </div>
            </label>
            {isSet && !values[spec.key] && (
              <p className="text-[13px] text-sq-muted">Значення збережено — залиште порожнім, щоб не змінювати.</p>
            )}
            {spec.hint && <p className="text-[13px] text-sq-muted">{spec.hint}</p>}
          </div>
        );
      })}
      <button
        type="button"
        className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]"
        disabled={saving}
        onClick={submit}
      >
        {saving ? 'Збереження…' : 'Зберегти дані доступу'}
      </button>
    </div>
  );
}
