// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuthStore } from '../../hooks/useAuth';
import { ProductPhotoField } from '../../components/ProductPhotoField';
import { MODULES } from '../../modules/registry';
import type { QrPaymentMode, StoreConfig } from '../../types';

export function SettingsPage() {
  const auth = useAuthStore((s) => s.auth);
  const [name, setName] = useState(auth?.store.name ?? '');
  const [slug, setSlug] = useState(auth?.store.slug ?? '');
  const [qrEnabled, setQrEnabled] = useState(false);
  const [qrMode, setQrMode] = useState<QrPaymentMode>('static');
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [qrIban, setQrIban] = useState('');
  const [qrEdrpou, setQrEdrpou] = useState('');
  const [qrRecipient, setQrRecipient] = useState('');
  const [qrPurposeTemplate, setQrPurposeTemplate] = useState('');
  // GTIN column default is TRUE — init checked so it doesn't flash "off" before getStore().
  const [gtinLookupEnabled, setGtinLookupEnabled] = useState(true);
  const [gtinApiKey, setGtinApiKey] = useState('');
  const [gtinApiKeySet, setGtinApiKeySet] = useState(false);
  const [gtinDailyLimit, setGtinDailyLimit] = useState('');
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false);
  const [enabledModules, setEnabledModules] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  function hydrate(store: StoreConfig) {
    setName(store.name);
    setSlug(store.slug);
    setQrEnabled(store.qr_payment_enabled);
    setQrMode(store.qr_payment_mode);
    setQrImageUrl(store.qr_static_image_url);
    setQrIban(store.qr_iban ?? '');
    setQrEdrpou(store.qr_edrpou ?? '');
    setQrRecipient(store.qr_recipient ?? '');
    setQrPurposeTemplate(store.qr_purpose_template ?? '');
    setGtinLookupEnabled(store.gtin_lookup_enabled);
    setGtinApiKeySet(store.gtin_api_key_set);
    setGtinApiKey('');
    setGtinDailyLimit(store.gtin_daily_limit?.toString() ?? '');
    setAutoPrintReceipt(store.auto_print_receipt);
    setEnabledModules(new Set(store.enabled_modules));
  }

  useEffect(() => {
    void api.getStore().then(hydrate);
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      const store = await api.updateStore({
        name,
        qr_payment_enabled: qrEnabled,
        qr_payment_mode: qrMode,
        qr_static_image_url: qrImageUrl,
        qr_iban: qrIban || null,
        qr_edrpou: qrEdrpou || null,
        qr_recipient: qrRecipient || null,
        qr_purpose_template: qrPurposeTemplate || null,
        gtin_lookup_enabled: gtinLookupEnabled,
        gtin_daily_limit: gtinDailyLimit.trim() ? Number(gtinDailyLimit) : null,
        auto_print_receipt: autoPrintReceipt,
        enabled_modules: [...enabledModules],
        // Only send the key when the field is non-empty (empty = keep the stored one).
        ...(gtinApiKey.trim() ? { gtin_api_key: gtinApiKey.trim() } : {}),
      });
      hydrate(store);
      // Refresh this tab's session so the sidebar reflects the new module set now.
      void useAuthStore.getState().bootstrap();
      setMessage('Збережено');
    } catch {
      setMessage('Помилка збереження');
    }
  }

  return (
    <div className="space-y-6 animate-fade-up max-w-xl text-sq-text">
      <div>
        <h2 className="text-2xl font-semibold">Налаштування</h2>
        <p className="text-sq-secondary mt-1 text-sm">Базові параметри магазину.</p>
      </div>

      <form onSubmit={onSave} className="space-y-6">
        <div className="bg-sq-surface border border-sq-divider rounded-sq p-5 space-y-4 shadow-sm">
          <label className="block">
            <span className="text-sm text-sq-secondary">Назва магазину</span>
            <input
              className="mt-1.5 w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sq-text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm text-sq-secondary">Код для PIN-входу</span>
            <input
              className="mt-1.5 w-full rounded-sq border border-sq-divider bg-sq-empty px-3 py-2.5 text-sq-secondary"
              value={slug}
              disabled
            />
          </label>
          <p className="text-sm text-sq-secondary">Валюта: грн (UAH)</p>
        </div>

        <div className="bg-sq-surface border border-sq-divider rounded-sq p-5 space-y-4 shadow-sm">
          <div>
            <p className="sq-section-label">QR-код оплата</p>
            <p className="text-sq-secondary text-sm mt-1">
              Каса приймає оплату по QR без автоматичного підтвердження — касир перевіряє успішність
              у застосунку покупця.
            </p>
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={qrEnabled}
              onChange={(e) => setQrEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">Показувати «QR-код» на екрані оплати</span>
          </label>

          <label className="block">
            <span className="text-sm text-sq-secondary">Режим</span>
            <select
              className="mt-1.5 w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sq-text"
              value={qrMode}
              onChange={(e) => setQrMode(e.target.value as QrPaymentMode)}
            >
              <option value="static">Статичний — завантажене зображення QR</option>
              <option value="dynamic">Динамічний — QR з точною сумою (Opendatabot)</option>
            </select>
          </label>

          <ProductPhotoField
            label="Зображення QR (статичний режим)"
            value={qrImageUrl}
            onChange={setQrImageUrl}
          />

          {qrMode === 'dynamic' && (
            <div className="space-y-4 border-t border-sq-divider pt-4">
              <label className="block">
                <span className="text-sm text-sq-secondary">IBAN отримувача</span>
                <input
                  className="mt-1.5 w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sq-text"
                  value={qrIban}
                  onChange={(e) => setQrIban(e.target.value)}
                  placeholder="UA…"
                />
              </label>
              <label className="block">
                <span className="text-sm text-sq-secondary">ЄДРПОУ / РНОКПП</span>
                <input
                  className="mt-1.5 w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sq-text"
                  value={qrEdrpou}
                  onChange={(e) => setQrEdrpou(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm text-sq-secondary">Отримувач</span>
                <input
                  className="mt-1.5 w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sq-text"
                  value={qrRecipient}
                  onChange={(e) => setQrRecipient(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm text-sq-secondary">Призначення платежу (шаблон)</span>
                <input
                  className="mt-1.5 w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sq-text"
                  value={qrPurposeTemplate}
                  onChange={(e) => setQrPurposeTemplate(e.target.value)}
                  placeholder="Оплата, чек {ref}, {store}"
                />
                <span className="text-xs text-sq-muted mt-1 block">
                  Плейсхолдери: {'{ref}'} — номер чека, {'{store}'} — назва магазину.
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="bg-sq-surface border border-sq-divider rounded-sq p-5 space-y-4 shadow-sm">
          <div>
            <p className="sq-section-label">Штрихкоди (GTIN)</p>
            <p className="text-sq-secondary text-sm mt-1">
              Під час приймання товару каса підтягує назву та бренд за штрихкодом із зовнішніх
              баз. На роботу касира не впливає.
            </p>
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={gtinLookupEnabled}
              onChange={(e) => setGtinLookupEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">Шукати товар за штрихкодом</span>
          </label>

          {gtinLookupEnabled && (
            <div className="space-y-4 border-t border-sq-divider pt-4">
              <label className="block">
                <span className="text-sm text-sq-secondary">API-ключ платного сервісу (upc.dev)</span>
                <input
                  type="password"
                  autoComplete="off"
                  className="mt-1.5 w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sq-text"
                  value={gtinApiKey}
                  onChange={(e) => setGtinApiKey(e.target.value)}
                  placeholder={
                    gtinApiKeySet ? '•••••••• збережено — введіть новий, щоб замінити' : 'не задано'
                  }
                />
                <span className="text-xs text-sq-muted mt-1 block">
                  Порожнє поле — ключ не змінюється. Якщо не задано, використовується серверний ключ.
                </span>
              </label>
              <label className="block">
                <span className="text-sm text-sq-secondary">Ліміт запитів на добу</span>
                <input
                  type="number"
                  min={1}
                  className="mt-1.5 w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sq-text"
                  value={gtinDailyLimit}
                  onChange={(e) => setGtinDailyLimit(e.target.value)}
                  placeholder="100"
                />
              </label>
            </div>
          )}
        </div>

        <div className="bg-sq-surface border border-sq-divider rounded-sq p-5 space-y-4 shadow-sm">
          <div>
            <p className="sq-section-label">Друк чеків</p>
            <p className="text-sq-secondary text-sm mt-1">
              Працює лише на робочому місці каси з налаштованим чековим принтером
              (десктоп-застосунок). У браузері та без принтера чек не друкується автоматично.
            </p>
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={autoPrintReceipt}
              onChange={(e) => setAutoPrintReceipt(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">Автоматично друкувати чек після продажу</span>
          </label>
        </div>

        <div className="bg-sq-surface border border-sq-divider rounded-sq p-5 space-y-4 shadow-sm">
          <div>
            <p className="sq-section-label">Модулі магазину</p>
            <p className="text-sq-secondary text-sm mt-1">
              Вимкнений модуль зникає з меню й стає недоступним у касі та адмінці. Каси
              підхоплять зміни після наступного входу.
            </p>
          </div>

          {MODULES.filter((m) => m.core).map((m) => (
            <label key={m.id} className="flex items-center gap-3 opacity-60">
              <input type="checkbox" checked disabled className="h-4 w-4" />
              <span className="text-sm">
                {m.title} <span className="text-xs text-sq-muted">— завжди увімкнено</span>
              </span>
            </label>
          ))}

          {MODULES.filter((m) => !m.core && m.id !== 'live-selling').map((m) => (
            <label key={m.id} className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={enabledModules.has(m.id)}
                onChange={(e) =>
                  setEnabledModules((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(m.id);
                    else next.delete(m.id);
                    return next;
                  })
                }
                className="h-4 w-4"
              />
              <span className="text-sm">{m.title}</span>
            </label>
          ))}
        </div>

        {message && <p className="text-sm text-sq-blue font-medium">{message}</p>}
        <button type="submit" className="sq-btn-primary px-4 py-2.5">
          Зберегти
        </button>
      </form>
    </div>
  );
}
