// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/pages/admin/FiscalSettingsCard.tsx
//
// The owner's ПРРО switch. Its own card with its own save button, deliberately
// outside `SettingsPage`'s single form:
//   * `/fiscal/settings` is a different endpoint with its own error vocabulary,
//     and that page's save handler collapses every failure into «Помилка
//     збереження» — which would swallow the one error this card exists to
//     explain (`secrets_key_missing`);
//   * a nested <form> is invalid HTML.
//
// Credentials are NOT edited here. They belong to the provider's own module
// screen; this card only reports which ones are set, so it can never trigger
// the 503 that a `secrets` write would.

import { useCallback, useEffect, useState } from 'react';
import { api } from '@pos/platform';
import { taxIdLine } from '../../lib/receipt';
import { SectionHead } from '../../components/ui/Page';
import type {
  FiscalProviderId,
  FiscalReceiptSource,
  FiscalReceiptWidth,
  FiscalRequisites,
  FiscalSettingsView,
} from '@pos/platform';

// `src/types.ts` is types-only by design, so the runtime list lives here.
// Order is the rollout order; the labels are what an owner recognises.
const PROVIDERS: ReadonlyArray<{ id: FiscalProviderId; label: string }> = [
  { id: 'checkbox', label: 'Checkbox' },
  { id: 'vchasno', label: 'Вчасно.Каса' },
  { id: 'echeck', label: 'Є-Чек' },
];

// The bounds `src/pos/fiscal/types.ts` enforces. Repeated here rather than
// exported from `types.ts`, which is types-only by design — and a runtime
// export from it would land in the `@pos/platform` barrel and cost a
// `PLATFORM_VERSION` bump for two numbers.
const CODES_TARGET_MIN = 50;
const CODES_TARGET_MAX = 2000;

const PROVIDER_LABEL: Record<FiscalProviderId, string> = {
  checkbox: 'Checkbox',
  vchasno: 'Вчасно.Каса',
  echeck: 'Є-Чек',
};

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error';

// The same field voice as the rest of «Налаштування»: a 13/600 label over the
// control, native checkboxes in the accent colour.
const LABEL = 'text-[13px] font-semibold text-sq-secondary';
const CHECKBOX = 'w-5 h-5 shrink-0 accent-[rgb(var(--sq-blue-rgb))]';

/**
 * What the provider knows about the store — read-only for now. Editing comes
 * later; today the point is that the owner types nothing: the block fills
 * itself on the first online contact (shift open, connection test).
 */
function RequisitesSection({
  requisites,
  fetchedAt,
  refreshing,
  onRefresh,
}: {
  requisites: FiscalRequisites | null;
  fetchedAt: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-xl bg-sq-sidebar px-[18px] py-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-semibold text-sq-heading">Реквізити ПРРО</p>
        <button
          type="button"
          className="min-h-9 text-[15px] font-semibold text-sq-blue disabled:opacity-50"
          disabled={refreshing}
          onClick={onRefresh}
        >
          {refreshing ? 'Оновлення…' : 'Оновити з ПРРО'}
        </button>
      </div>
      {!requisites ? (
        <p className="text-[15px] text-sq-secondary">
          Ще не отримано. З’являться після першого чека онлайн — або натисніть «Оновити з ПРРО».
        </p>
      ) : (
        <dl className="text-[15px] grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          {requisites.organization.name && (
            <>
              <dt className="text-sq-secondary">Організація</dt>
              <dd className="text-sq-text">{requisites.organization.name}</dd>
            </>
          )}
          {taxIdLine(requisites) && (
            <>
              <dt className="text-sq-secondary">Податковий №</dt>
              <dd className="text-sq-text tabular-nums">{taxIdLine(requisites)}</dd>
            </>
          )}
          {requisites.point.name && (
            <>
              <dt className="text-sq-secondary">Точка</dt>
              <dd className="text-sq-text">{requisites.point.name}</dd>
            </>
          )}
          {requisites.point.address && (
            <>
              <dt className="text-sq-secondary">Адреса</dt>
              <dd className="text-sq-text">{requisites.point.address}</dd>
            </>
          )}
          {requisites.register.fiscal_number && (
            <>
              <dt className="text-sq-secondary">ФН ПРРО</dt>
              <dd className="text-sq-text tabular-nums">{requisites.register.fiscal_number}</dd>
            </>
          )}
          {requisites.taxes.length > 0 && (
            <>
              <dt className="text-sq-secondary">Ставки</dt>
              <dd className="text-sq-text">
                {requisites.taxes
                  .map((t) => `${t.symbol} — ${t.label || `${t.rate}%`}${t.is_default ? ' (за замовч.)' : ''}`)
                  .join('; ')}
              </dd>
            </>
          )}
        </dl>
      )}
      {fetchedAt && (
        <p className="text-[13px] text-sq-muted">Оновлено {new Date(fetchedAt).toLocaleString('uk-UA')}</p>
      )}
      <p className="text-[13px] text-sq-muted">
        Друкуються в шапці кожного фіскального чека. Редагування — згодом; поки що так, як
        зареєстровано у провайдера.
      </p>
    </div>
  );
}

function errorText(error: unknown): string {
  const res = (
    error as { response?: { status?: number; data?: { error?: string; message?: string } } }
  ).response;
  if (res?.status === 503 && res.data?.error === 'secrets_key_missing') {
    return 'Сервер не налаштовано для зберігання ключів ПРРО — зверніться до адміністратора.';
  }
  if (res?.status === 403) return 'Лише власник магазину може змінювати ці налаштування.';
  return res?.data?.error || res?.data?.message || 'Не вдалося зберегти. Спробуйте ще раз.';
}

export function FiscalSettingsCard() {
  const [state, setState] = useState<LoadState>('loading');
  const [settings, setSettings] = useState<FiscalSettingsView | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<FiscalProviderId | ''>('');
  const [taxCode, setTaxCode] = useState('');
  const [autoOpenShift, setAutoOpenShift] = useState(true);
  const [receiptSource, setReceiptSource] = useState<FiscalReceiptSource>('local');
  const [receiptWidth, setReceiptWidth] = useState<FiscalReceiptWidth>(32);
  const [offlineMode, setOfflineMode] = useState(false);
  // A string, not a number: a half-typed value must not snap back while the
  // owner is still typing it.
  const [codesTarget, setCodesTarget] = useState(String(200));
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function hydrate(view: FiscalSettingsView) {
    setSettings(view);
    setEnabled(view.enabled);
    setProvider(view.provider ?? '');
    setTaxCode(view.default_tax_code ?? '');
    setAutoOpenShift(view.auto_open_shift);
    setReceiptSource(view.receipt_source === 'provider' ? 'provider' : 'local');
    setReceiptWidth(view.receipt_width === 48 ? 48 : 32);
    setOfflineMode(view.offline_mode);
    setCodesTarget(String(view.offline_codes_target));
  }

  const load = useCallback(async () => {
    setState('loading');
    try {
      hydrate(await api.fiscalSettings());
      setState('ready');
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      setState(status === 403 ? 'forbidden' : 'error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Owner-only endpoint; a seller simply does not see the card.
  if (state === 'forbidden') return null;

  const secretsMissing = settings ? !settings.secrets_key_configured : false;
  const adapterMissing = Boolean(settings?.provider) && settings?.adapter_available === false;
  const canEnable = Boolean(provider) && !secretsMissing && !adapterMissing;
  // Offline mode belongs to the provider that is SAVED, not the one picked in
  // the dropdown: switching provider drops it server-side anyway, and showing
  // the switch for an unsaved pick would promise something the save undoes.
  const offlineCapable = settings?.offline_capable ?? false;
  const month = settings?.offline_month ?? null;
  const monthLow = month ? month.limit_ms - month.used_ms <= 12 * 3_600_000 : false;
  const canGoOffline = offlineCapable && canEnable && enabled;
  const parsedTarget = Number(codesTarget);
  const targetValid =
    Number.isInteger(parsedTarget) &&
    parsedTarget >= CODES_TARGET_MIN &&
    parsedTarget <= CODES_TARGET_MAX;

  // The connection test is the backend's "refresh the requisites" moment for
  // an enabled store, so the button is that call plus a reload of this card.
  async function refreshRequisites() {
    setRefreshing(true);
    setMessage(null);
    try {
      await api.posRequest('post', '/fiscal/test-connection');
      hydrate(await api.fiscalSettings());
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setRefreshing(false);
    }
  }

  async function save() {
    if (offlineCapable && !targetValid) {
      setMessage(`Запас кодів — ціле число від ${CODES_TARGET_MIN} до ${CODES_TARGET_MAX}.`);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.updateFiscalSettings({
        enabled: canEnable ? enabled : false,
        provider: provider || null,
        default_tax_code: taxCode.trim() || null,
        auto_open_shift: autoOpenShift,
        receipt_source: receiptSource,
        receipt_width: receiptWidth,
        // Sent only for a provider that can actually go offline: for the others
        // the backend refuses `true` and would store `false` anyway.
        ...(offlineCapable
          ? { offline_mode: canGoOffline ? offlineMode : false, offline_codes_target: parsedTarget }
          : {}),
      });
      // Merge, never replace: the PATCH response does not carry
      // `adapter_available`, so overwriting would make the warning vanish on
      // save and reappear on the next reload.
      setSettings((prev) => ({ ...(prev ?? saved), ...saved }));
      setEnabled(saved.enabled);
      // The backend silently drops offline mode when the provider changes or
      // fiscalisation goes off; echo what it actually stored.
      setOfflineMode(saved.offline_mode);
      setCodesTarget(String(saved.offline_codes_target));
      setMessage('Збережено');
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <SectionHead title="Фіскалізація (ПРРО)" />

      <div className="pt-4 space-y-4">
        {state === 'loading' && <p className="text-[15px] text-sq-secondary">Завантаження…</p>}

        {state === 'error' && (
          <div className="text-[15px]">
            <p className="text-sq-secondary">Не вдалося завантажити налаштування ПРРО.</p>
            <button
              type="button"
              className="mt-1 min-h-9 font-semibold text-sq-blue"
              onClick={() => void load()}
            >
              Спробувати ще раз
            </button>
          </div>
        )}

        {state === 'ready' && settings && (
          <>
            {secretsMissing && (
              <p role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-[15px]">
                Сервер не налаштовано для зберігання ключів ПРРО (<code>POS_SECRETS_KEY</code>).
                Увімкнути фіскалізацію не можна.
              </p>
            )}
            {adapterMissing && (
              <p role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-[15px]">
                Для провайдера «{PROVIDER_LABEL[settings.provider as FiscalProviderId]}» у цій версії
                застосунку немає модуля. Кожен продаж отримає помилку.
              </p>
            )}

            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Провайдер</span>
              <select
                className="sq-input"
                value={provider}
                onChange={(e) => setProvider(e.target.value as FiscalProviderId | '')}
              >
                <option value="">Не обрано</option>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <label className="min-h-11 flex items-center gap-3 text-[15px]">
                <input
                  type="checkbox"
                  className={CHECKBOX}
                  checked={enabled}
                  disabled={!canEnable}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span className={canEnable ? 'text-sq-text' : 'text-sq-muted'}>
                  Реєструвати чеки в ПРРО
                </span>
              </label>

              <label className="min-h-11 flex items-center gap-3 text-[15px] text-sq-text">
                <input
                  type="checkbox"
                  className={CHECKBOX}
                  checked={autoOpenShift}
                  onChange={(e) => setAutoOpenShift(e.target.checked)}
                />
                <span>Відкривати зміну автоматично</span>
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>Код ставки за замовчуванням</span>
              <input
                className="sq-input"
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
                placeholder="напр. A"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2 items-start">
              <label className="flex flex-col gap-1.5">
                <span className={LABEL}>Джерело чека</span>
                <select
                  className="sq-input"
                  value={receiptSource}
                  onChange={(e) => setReceiptSource(e.target.value as FiscalReceiptSource)}
                >
                  <option value="local">Наш макет + фіскальний блок</option>
                  <option value="provider">Чек від провайдера, як є</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={LABEL}>Ширина чекової стрічки</span>
                <select
                  className="sq-input"
                  value={receiptWidth}
                  onChange={(e) => setReceiptWidth(Number(e.target.value) === 48 ? 48 : 32)}
                >
                  <option value={32}>58 мм</option>
                  <option value={48}>80 мм</option>
                </select>
              </label>
            </div>
            <p className="-mt-2 text-[13px] text-sq-muted">
              Під неї провайдер верстає свій чек. Принтер кожної каси обирається окремо на екрані
              «Обладнання».
            </p>

            {/* Offline mode. Rendered only for a provider whose adapter can do it —
                for the others this is not "off", it does not exist. The switch
                lives here rather than in the provider's own bundle for the same
                reason `enabled` does (TechDocs/POS_FISCAL_PRRO.md §"Тумблер живёт
                в хосте"): on the web a bundle can fail to load silently, and an
                owner must always be able to switch offline mode back OFF. */}
            {offlineCapable && (
              <div className="space-y-2">
                <label className="min-h-11 flex items-center gap-3 text-[15px]">
                  <input
                    type="checkbox"
                    className={CHECKBOX}
                    checked={offlineMode}
                    disabled={!canGoOffline}
                    onChange={(e) => setOfflineMode(e.target.checked)}
                  />
                  <span className={canGoOffline ? 'text-sq-text' : 'text-sq-muted'}>Офлайн-режим ПРРО</span>
                </label>
                <div className="pl-8 space-y-3">
                  <p className="text-[13px] leading-relaxed text-sq-secondary">
                    {canGoOffline
                      ? 'Каса продовжує продавати без зв’язку з ПРРО: чеки отримують фіскальні номери із запасу і надсилаються в ДПС автоматично, щойно зв’язок відновиться.'
                      : 'Спершу увімкніть реєстрацію чеків у ПРРО.'}
                  </p>
                  <label className="flex flex-col gap-1.5 max-w-xs">
                    <span className={LABEL}>Запас фіскальних кодів</span>
                    <input
                      className="sq-input tabular-nums"
                      inputMode="numeric"
                      value={codesTarget}
                      onChange={(e) => setCodesTarget(e.target.value)}
                    />
                  </label>
                  <p className="text-[13px] text-sq-muted">
                    Скільки кодів тримати про запас: {CODES_TARGET_MIN}–{CODES_TARGET_MAX}. Один код —
                    один офлайн-чек.
                  </p>
                </div>
              </div>
            )}

            {settings.provider && (
              <RequisitesSection
                requisites={settings.requisites}
                fetchedAt={settings.requisites_fetched_at}
                refreshing={refreshing}
                onRefresh={() => void refreshRequisites()}
              />
            )}

            <div className="text-[13px] text-sq-secondary space-y-1">
              <p>
                Дані доступу:{' '}
                {settings.secrets_set.length
                  ? settings.secrets_set.join(', ')
                  : 'не збережено'}{' '}
                — керуються на екрані ПРРО.
              </p>
              <p>
                {settings.offline_mode
                  ? 'Якщо ПРРО недоступне: продаж триває, чеки надсилаються пізніше.'
                  : 'Якщо ПРРО недоступне: продаж блокується.'}
              </p>
              {settings.offline_month && (
                // 168 годин на календарний місяць — Положення № 13. Лічильник
                // ведеться на сервері по реєстратору: офлайн будь-якої каси
                // витрачає ті самі години.
                <p className={monthLow ? 'text-amber-700 font-medium' : undefined}>
                  Офлайн цього місяця: {Math.floor(settings.offline_month.used_ms / 3_600_000)} год
                  із {Math.floor(settings.offline_month.limit_ms / 3_600_000)}
                  {monthLow && ' — залишок малий, продаж без звʼязку скоро стане неможливим'}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? 'Збереження…' : 'Зберегти ПРРО'}
              </button>
              {message && (
                <span
                  className={`text-[15px] ${message === 'Збережено' ? 'text-sq-success-ink font-medium' : 'text-red-600'}`}
                >
                  {message}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
