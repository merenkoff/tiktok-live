// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-checkbox/pages/CheckboxAdminPage.tsx
//
// `/admin/fiscal` — owner-only by construction (`mount: 'admin'`, see the
// manifest). What lives HERE vs on the host's `FiscalSettingsCard`:
//
//   host card:  enabled / provider / default_tax_code / auto_open_shift
//   this page:  credentials (Checkbox-specific fields), "Перевірити
//               з'єднання", the list of documents the retry cron gave up on
//
// The `enabled`/`provider` toggle is deliberately NOT editable here — see
// TechDocs/POS_FISCAL_PRRO.md "Тумблер живёт в хосте": if the only editor for
// "is fiscalisation on" lived inside this bundle, a store whose bundle failed
// to load would have no way to turn it off.

import { useCallback, useEffect, useState } from 'react';
import {
  getFiscalSettingsView,
  listFiscalAttention,
  saveFiscalSecrets,
  testFiscalConnection,
} from '../../fiscal-core/data/fiscalApi';
import { SecretsForm } from '../../fiscal-core/components/SecretsForm';
import { FiscalErrorCard } from '../../fiscal-core/components/FiscalErrorCard';
import { CHECKBOX_SECRET_SPECS } from '../secretSpecs';
import type { AttentionDoc, FiscalProbe } from '../../fiscal-core/types';
import type { FiscalSettingsView } from '../../../types';

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2) + ' ₴';
}

function AttentionList() {
  const [docs, setDocs] = useState<AttentionDoc[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    listFiscalAttention()
      .then((res) => setDocs(res.documents))
      .catch(setError);
  }, []);

  if (error) return <FiscalErrorCard error={error} />;
  if (!docs) return <p className="text-sm text-sq-secondary">Завантаження…</p>;
  if (docs.length === 0) {
    return <p className="text-sm text-sq-secondary">Немає документів, що потребують уваги.</p>;
  }

  return (
    <ul className="divide-y divide-sq-divider rounded-sq border border-sq-divider">
      {docs.map((doc) => (
        <li key={doc.id} className="p-3 text-sm">
          <div className="flex justify-between">
            <span className="font-medium">{doc.receipt_number ?? `#${doc.id}`}</span>
            <span>{formatCents(doc.total_cents)}</span>
          </div>
          <p className="mt-1 text-xs text-red-600">
            {doc.error_message ?? doc.error_code ?? 'Помилка ПРРО'}
          </p>
          <p className="mt-0.5 text-xs text-sq-muted">
            Спроб: {doc.attempts} · {new Date(doc.created_at).toLocaleString('uk-UA')}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function CheckboxAdminPage() {
  const [settings, setSettings] = useState<FiscalSettingsView | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [probe, setProbe] = useState<FiscalProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<unknown>(null);

  const load = useCallback(() => {
    getFiscalSettingsView().then(setSettings).catch(setLoadError);
  }, []);

  useEffect(load, [load]);

  async function saveSecrets(values: Record<string, string | null>) {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveFiscalSecrets(values);
      setSettings(saved);
    } catch (e) {
      setSaveError(e);
    } finally {
      setSaving(false);
    }
  }

  async function runProbe() {
    setProbing(true);
    setProbeError(null);
    setProbe(null);
    try {
      setProbe(await testFiscalConnection());
    } catch (e) {
      setProbeError(e);
    } finally {
      setProbing(false);
    }
  }

  return (
    <div className="p-5 space-y-6 max-w-lg">
      <h1 className="text-lg font-semibold">Фіскалізація — Checkbox</h1>

      {Boolean(loadError) && <FiscalErrorCard error={loadError} />}

      {settings && (
        <>
          <section className="space-y-2">
            <p className="sq-section-label">Дані доступу</p>
            <SecretsForm
              specs={CHECKBOX_SECRET_SPECS}
              secretsSet={settings.secrets_set}
              saving={saving}
              onSave={(values) => void saveSecrets(values)}
            />
            {Boolean(saveError) && <FiscalErrorCard error={saveError} />}
          </section>

          <section className="space-y-2">
            <p className="sq-section-label">Зʼєднання</p>
            <button
              type="button"
              className="rounded-sq border border-sq-divider px-4 py-2 text-sm font-medium"
              disabled={probing}
              onClick={() => void runProbe()}
            >
              {probing ? 'Перевірка…' : "Перевірити з'єднання"}
            </button>
            {Boolean(probeError) && <FiscalErrorCard error={probeError} />}
            {probe && (
              <div
                className={`rounded-sq px-3 py-2 text-sm ${
                  probe.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-900'
                }`}
              >
                {probe.ok ? (
                  <>
                    <p className="font-semibold">З'єднання успішне</p>
                    {probe.cashierName && <p>Касир: {probe.cashierName}</p>}
                    {probe.cashRegister && <p>Каса: {probe.cashRegister}</p>}
                  </>
                ) : (
                  <p>{probe.message ?? 'Перевірка не пройдена'}</p>
                )}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <p className="sq-section-label">Потребують уваги</p>
            <AttentionList />
          </section>
        </>
      )}
    </div>
  );
}
