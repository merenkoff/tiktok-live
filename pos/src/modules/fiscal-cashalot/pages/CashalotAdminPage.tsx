// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-cashalot/pages/CashalotAdminPage.tsx
//
// `/admin/fiscal` for Cashalot — owner-only by construction (`mount: 'admin'`).
// The split with the host's `FiscalSettingsCard` is the Checkbox one:
//
//   host card:  enabled / provider / auto_open_shift (the switch an owner must
//               reach even when this bundle fails to load)
//   this page:  the three credentials, the tax table + test mode (Cashalot's
//               `config`) with the default rate chosen FROM that table,
//               «Перевірити з'єднання», «Потребують уваги»
//
// No print-source switch (Cashalot renders no receipt text, so the host card
// hides it) and no offline or register panels (the adapter has no `offline`).

import { useCallback, useEffect, useState } from 'react';
import { PageHeader, SectionHead, ShieldCheck } from '@pos/platform/ui';
import {
  getFiscalSettingsView,
  saveFiscalConfig,
  saveFiscalSecrets,
  testFiscalConnection,
} from '../../fiscal-core/data/fiscalApi';
import { SecretsForm } from '../../fiscal-core/components/SecretsForm';
import { FiscalErrorCard } from '../../fiscal-core/components/FiscalErrorCard';
import { AttentionList } from '../../fiscal-core/components/AttentionList';
import { ProbeSection } from '../../fiscal-core/components/ProbeSection';
import { TaxTableForm } from '../components/TaxTableForm';
import { CASHALOT_SECRET_SPECS } from '../secretSpecs';
import type { FiscalSettingsView } from '../../../types';

/**
 * `PATCH /fiscal/settings` is the one fiscal route whose 400 carries the
 * owner's sentence in `error` («Ставка 2: …», «…лише при закритій зміні…»)
 * rather than a machine code — the adapter's `normalizeConfig` refusal,
 * passed through verbatim. Shown as is; anything else goes to the generic
 * card with its support code.
 */
function settingsRefusal(error: unknown): string | null {
  const res = (error as { response?: { status?: number; data?: { error?: unknown } } })?.response;
  return res?.status === 400 && typeof res.data?.error === 'string' ? res.data.error : null;
}

function SaveError({ error }: { error: unknown }) {
  const refusal = settingsRefusal(error);
  if (refusal) {
    return (
      <p role="alert" className="text-[15px] text-red-600">
        {refusal}
      </p>
    );
  }
  return <FiscalErrorCard error={error} />;
}

export function TestingBanner({ where }: { where: 'admin' | 'till' }) {
  return (
    <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-800">
      <span className="font-semibold">Тестовий режим.</span>{' '}
      {where === 'till'
        ? 'Тестова зміна — чеки без фіскальної сили.'
        : 'Чеки реєструються як тестові, без фіскальної сили. Вимкніть його нижче перед першим справжнім продажем.'}
    </p>
  );
}

export function CashalotAdminPage() {
  const [settings, setSettings] = useState<FiscalSettingsView | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [savingSecrets, setSavingSecrets] = useState(false);
  const [secretsError, setSecretsError] = useState<unknown>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<unknown>(null);
  const [configNote, setConfigNote] = useState<string | null>(null);

  const load = useCallback(() => {
    getFiscalSettingsView().then(setSettings).catch(setLoadError);
  }, []);

  useEffect(load, [load]);

  async function saveSecrets(values: Record<string, string | null>) {
    setSavingSecrets(true);
    setSecretsError(null);
    try {
      setSettings(await saveFiscalSecrets(values));
    } catch (e) {
      setSecretsError(e);
    } finally {
      setSavingSecrets(false);
    }
  }

  async function saveConfig(config: Record<string, unknown>, defaultTaxCode: string | null) {
    setSavingConfig(true);
    setConfigError(null);
    setConfigNote(null);
    try {
      const saved = await saveFiscalConfig(config, defaultTaxCode);
      setSettings(saved);
      setConfigNote('Збережено');
      // The till prints the rate letters from the cached requisites, which
      // Cashalot's adapter builds from this very table. The save aged that
      // cache out; the connection test is what fills it again, for a store
      // that is already fiscalising (the backend refreshes only then).
      if (saved.enabled) {
        try {
          await testFiscalConnection();
          setSettings(await getFiscalSettingsView());
        } catch {
          // The table is saved either way; the next shift open refreshes too.
        }
      }
    } catch (e) {
      setConfigError(e);
    } finally {
      setSavingConfig(false);
    }
  }

  return (
    <div className="space-y-8 animate-fade-up max-w-2xl text-sq-text">
      <PageHeader glyph={ShieldCheck} title="Фіскалізація — Cashalot" />

      {Boolean(loadError) && <FiscalErrorCard error={loadError} />}

      {settings && (
        <>
          {settings.config.testing === true && <TestingBanner where="admin" />}

          <section>
            <SectionHead title="Дані доступу" />
            <div className="pt-4 space-y-3">
              <SecretsForm
                specs={CASHALOT_SECRET_SPECS}
                secretsSet={settings.secrets_set}
                saving={savingSecrets}
                onSave={(values) => void saveSecrets(values)}
              />
              {Boolean(secretsError) && <SaveError error={secretsError} />}
            </div>
          </section>

          <section>
            <SectionHead title="Ставки податку й режим" />
            <div className="pt-4 space-y-3">
              <TaxTableForm
                settings={settings}
                saving={savingConfig}
                onSave={(config, code) => void saveConfig(config, code)}
              />
              {configNote && (
                <p className="text-[15px] font-medium text-sq-success-ink">{configNote}</p>
              )}
              {Boolean(configError) && <SaveError error={configError} />}
            </div>
          </section>

          <ProbeSection />

          <section>
            <SectionHead title="Потребують уваги" />
            <AttentionList />
          </section>
        </>
      )}
    </div>
  );
}
