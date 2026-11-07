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
//
// A store may run a SECOND register — another ФОП's (track ДК,
// TechDocs/POS_DUAL_REGISTER.md): a tab per register, each with its own keys,
// tax table, test mode, probe and worklist, and on register 2's tab its name
// and its switch. Register 1 is the host card's switch, never this page's.

import { useCallback, useEffect, useState } from 'react';
import { PageHeader, SectionHead, ShieldCheck } from '@pos/platform/ui';
import {
  getFiscalSettingsView,
  saveFiscalConfig,
  saveFiscalSecrets,
  saveRegisterBasics,
  testFiscalConnection,
} from '../../fiscal-core/data/fiscalApi';
import { SecretsForm } from '../../fiscal-core/components/SecretsForm';
import { FiscalErrorCard } from '../../fiscal-core/components/FiscalErrorCard';
import { AttentionList } from '../../fiscal-core/components/AttentionList';
import { ProbeSection } from '../../fiscal-core/components/ProbeSection';
import { TaxTableForm } from '../components/TaxTableForm';
import { CASHALOT_SECRET_SPECS } from '../secretSpecs';
import { registerTitle } from '../lib/registerTitle';
import type { FiscalSettingsView } from '@host/types';

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

/**
 * One register's settings — keys, tax table, test mode, probe, worklist. The
 * same screen for register 1 and 2; `onSaved` lets the page re-read register
 * 1's view, which lists the others.
 */
function RegisterSettings({
  registerNo,
  initial,
  onSaved,
}: {
  registerNo: number;
  /** The view the page already read (register 1's), so it is not read twice. */
  initial?: FiscalSettingsView | null;
  onSaved: (view: FiscalSettingsView) => void;
}) {
  const [settings, setSettings] = useState<FiscalSettingsView | null>(initial ?? null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [savingSecrets, setSavingSecrets] = useState(false);
  const [secretsError, setSecretsError] = useState<unknown>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<unknown>(null);
  const [configNote, setConfigNote] = useState<string | null>(null);

  const hasInitial = initial != null;
  useEffect(() => {
    if (hasInitial) return;
    getFiscalSettingsView(registerNo).then(setSettings).catch(setLoadError);
  }, [registerNo, hasInitial]);

  function accept(view: FiscalSettingsView) {
    setSettings(view);
    onSaved(view);
  }

  async function saveSecrets(values: Record<string, string | null>) {
    setSavingSecrets(true);
    setSecretsError(null);
    try {
      accept(await saveFiscalSecrets(values, registerNo));
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
      const saved = await saveFiscalConfig(config, defaultTaxCode, registerNo);
      accept(saved);
      setConfigNote('Збережено');
      // The till prints the rate letters from the cached requisites, which
      // Cashalot's adapter builds from this very table. The save aged that
      // cache out; the connection test is what fills it again, for a store
      // that is already fiscalising (the backend refreshes only then).
      if (saved.enabled) {
        try {
          await testFiscalConnection(registerNo);
          setSettings(await getFiscalSettingsView(registerNo));
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

  if (loadError) return <FiscalErrorCard error={loadError} />;
  if (!settings) return <p className="text-[15px] text-sq-muted">Завантаження…</p>;

  return (
    <div className="space-y-8">
      {settings.config.testing === true && <TestingBanner where="admin" />}

      {registerNo !== 1 && (
        <RegisterBasics registerNo={registerNo} settings={settings} onSaved={accept} />
      )}

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
          {configNote && <p className="text-[15px] font-medium text-sq-success-ink">{configNote}</p>}
          {Boolean(configError) && <SaveError error={configError} />}
        </div>
      </section>

      <ProbeSection registerNo={registerNo} />

      <section>
        <SectionHead title="Потребують уваги" />
        <AttentionList registerNo={registerNo} />
      </section>
    </div>
  );
}

/**
 * Register 2's own two fields: what it is called (on the till, on the
 * dashboard, in the product card) and whether it works. Switching it on is
 * refused in the owner's words while register 1 is not an online Cashalot, and
 * switching it off while its shift is open or documents are queued.
 */
function RegisterBasics({
  registerNo,
  settings,
  onSaved,
}: {
  registerNo: number;
  settings: FiscalSettingsView;
  onSaved: (view: FiscalSettingsView) => void;
}) {
  const [label, setLabel] = useState(settings.label ?? '');
  const [enabled, setEnabled] = useState(settings.enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);
  const dirty = label.trim() !== (settings.label ?? '').trim() || enabled !== settings.enabled;

  async function save() {
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      onSaved(await saveRegisterBasics(registerNo, { label: label.trim() || null, enabled }));
      setNote('Збережено');
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section data-testid="register-basics">
      <SectionHead title="Друга каса" />
      <div className="pt-4 space-y-3">
        <p className="text-[15px] text-sq-secondary">
          Інший ФОП: свої ключі Cashalot і своя таблиця ставок. Які товари йдуть на цю касу, вибирається в картці
          товару («Каса») або для кількох одразу в списку товарів.
        </p>
        <label className="block">
          <span className="text-[13px] text-sq-secondary">Назва</span>
          <input
            className="mt-1 w-full min-h-11 rounded-[10px] bg-sq-surface ring-1 ring-inset ring-sq-divider px-3 text-[15px]"
            value={label}
            maxLength={60}
            placeholder="Наприклад: Бар"
            onChange={(e) => setLabel(e.target.value)}
            data-testid="register-label"
          />
        </label>
        <label className="flex items-center gap-2.5 text-[15px] cursor-pointer">
          <input
            type="checkbox"
            className="w-5 h-5"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            data-testid="register-enabled"
          />
          Каса працює — товари, призначені на неї, пробиваються її чеком
        </label>
        <button
          type="button"
          className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px] disabled:opacity-50"
          disabled={!dirty || saving}
          onClick={() => void save()}
          data-testid="register-basics-save"
        >
          {saving ? 'Збереження…' : 'Зберегти'}
        </button>
        {note && <p className="text-[15px] font-medium text-sq-success-ink">{note}</p>}
        {Boolean(error) && <SaveError error={error} />}
      </div>
    </section>
  );
}

export function CashalotAdminPage() {
  // Register 1's view: it lists the store's further registers.
  const [main, setMain] = useState<FiscalSettingsView | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [tab, setTab] = useState(1);
  const [adding, setAdding] = useState(false);

  const loadMain = useCallback(() => {
    getFiscalSettingsView(1).then(setMain).catch(setLoadError);
  }, []);

  useEffect(loadMain, [loadMain]);

  const extras = main?.extra_registers ?? [];
  const tabs: Array<{ registerNo: number; title: string }> = [
    { registerNo: 1, title: registerTitle(1) },
    ...extras.map((r) => ({ registerNo: r.register_no, title: registerTitle(r.register_no, r.label) })),
    ...(adding && !extras.some((r) => r.register_no === 2) ? [{ registerNo: 2, title: registerTitle(2) }] : []),
  ];
  // A second register stands beside a Cashalot register 1 that is on (Д5).
  const canAdd = extras.length === 0 && !adding && main?.provider === 'cashalot' && main.enabled;

  return (
    <div className="space-y-8 animate-fade-up max-w-2xl text-sq-text">
      <PageHeader glyph={ShieldCheck} title="Фіскалізація — Cashalot" />

      {Boolean(loadError) && <FiscalErrorCard error={loadError} />}

      {tabs.length > 1 && (
        <div role="tablist" aria-label="Каси" className="flex flex-wrap gap-2" data-testid="register-tabs">
          {tabs.map((t) => (
            <button
              key={t.registerNo}
              type="button"
              role="tab"
              aria-selected={tab === t.registerNo}
              onClick={() => setTab(t.registerNo)}
              className={`min-h-11 px-4 rounded-[10px] text-[15px] font-semibold ${
                tab === t.registerNo ? 'bg-sq-blue text-white' : 'bg-sq-surface ring-1 ring-inset ring-sq-divider text-sq-text'
              }`}
            >
              {t.title}
            </button>
          ))}
        </div>
      )}

      {main && (
        <RegisterSettings
          key={tab}
          registerNo={tab}
          initial={tab === 1 ? main : null}
          onSaved={(view) => (tab === 1 ? setMain(view) : loadMain())}
        />
      )}

      {tab === 1 && canAdd && (
        <section data-testid="register-add">
          <SectionHead title="Друга каса" />
          <div className="pt-4 space-y-3">
            <p className="text-[15px] text-sq-secondary">
              Якщо частину товарів продає інший ФОП (наприклад, алкоголь — ФОП із ліцензією), підключіть його касу
              Cashalot тут. Тоді замовлення з товарами обох ФОП пробивається двома чеками.
            </p>
            <button
              type="button"
              className="sq-btn-quiet"
              onClick={() => {
                setAdding(true);
                setTab(2);
              }}
            >
              Додати другу касу
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
