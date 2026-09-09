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
import type { FiscalProviderId, FiscalSettingsView } from '@pos/platform';

// `src/types.ts` is types-only by design, so the runtime list lives here.
// Order is the rollout order; the labels are what an owner recognises.
const PROVIDERS: ReadonlyArray<{ id: FiscalProviderId; label: string }> = [
  { id: 'checkbox', label: 'Checkbox' },
  { id: 'vchasno', label: 'Вчасно.Каса' },
  { id: 'echeck', label: 'Є-Чек' },
];

const PROVIDER_LABEL: Record<FiscalProviderId, string> = {
  checkbox: 'Checkbox',
  vchasno: 'Вчасно.Каса',
  echeck: 'Є-Чек',
};

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error';

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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function hydrate(view: FiscalSettingsView) {
    setSettings(view);
    setEnabled(view.enabled);
    setProvider(view.provider ?? '');
    setTaxCode(view.default_tax_code ?? '');
    setAutoOpenShift(view.auto_open_shift);
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

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.updateFiscalSettings({
        enabled: canEnable ? enabled : false,
        provider: provider || null,
        default_tax_code: taxCode.trim() || null,
        auto_open_shift: autoOpenShift,
      });
      // Merge, never replace: the PATCH response does not carry
      // `adapter_available`, so overwriting would make the warning vanish on
      // save and reappear on the next reload.
      setSettings((prev) => ({ ...(prev ?? saved), ...saved }));
      setEnabled(saved.enabled);
      setMessage('Збережено');
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-sq-surface border border-sq-divider rounded-sq p-5 space-y-4 shadow-sm">
      <p className="sq-section-label">Фіскалізація (ПРРО)</p>

      {state === 'loading' && <p className="text-sm text-sq-secondary">Завантаження…</p>}

      {state === 'error' && (
        <div className="text-sm">
          <p className="text-sq-secondary">Не вдалося завантажити налаштування ПРРО.</p>
          <button type="button" className="mt-2 underline text-sq-blue" onClick={() => void load()}>
            Спробувати ще раз
          </button>
        </div>
      )}

      {state === 'ready' && settings && (
        <>
          {secretsMissing && (
            <p role="alert" className="rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm">
              Сервер не налаштовано для зберігання ключів ПРРО (<code>POS_SECRETS_KEY</code>).
              Увімкнути фіскалізацію не можна.
            </p>
          )}
          {adapterMissing && (
            <p role="alert" className="rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm">
              Для провайдера «{PROVIDER_LABEL[settings.provider as FiscalProviderId]}» у цій версії
              застосунку немає модуля. Кожен продаж отримає помилку.
            </p>
          )}

          <label className="block text-sm">
            <span className="text-sq-secondary">Провайдер</span>
            <select
              className="pos-input mt-1 w-full"
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

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canEnable}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className={canEnable ? '' : 'text-sq-muted'}>
              Реєструвати чеки в ПРРО
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoOpenShift}
              onChange={(e) => setAutoOpenShift(e.target.checked)}
            />
            <span>Відкривати зміну автоматично</span>
          </label>

          <label className="block text-sm">
            <span className="text-sq-secondary">Код ставки за замовчуванням</span>
            <input
              className="pos-input mt-1 w-full"
              value={taxCode}
              onChange={(e) => setTaxCode(e.target.value)}
              placeholder="напр. A"
            />
          </label>

          <div className="text-xs text-sq-secondary space-y-1">
            <p>
              Дані доступу:{' '}
              {settings.secrets_set.length
                ? settings.secrets_set.join(', ')
                : 'не збережено'}{' '}
              — керуються на екрані ПРРО.
            </p>
            {/* Both inert until the print-source decision lands. */}
            <p>Якщо ПРРО недоступне: продаж блокується.</p>
            <p>Джерело чека: {settings.receipt_source === 'provider' ? 'провайдер' : 'локальне'}</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="pos-btn-primary px-4 py-2"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Збереження…' : 'Зберегти ПРРО'}
            </button>
            {message && <span className="text-sm text-sq-secondary">{message}</span>}
          </div>
        </>
      )}
    </div>
  );
}
