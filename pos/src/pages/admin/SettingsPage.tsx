// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useState } from 'react';
import { api, useAuthStore, sameRemoteMap } from '@pos/platform';
import { ProductPhotoField } from '../../components/ProductPhotoField';
import { FiscalSettingsCard } from './FiscalSettingsCard';
import { MODULES } from '../../modules/registry';
import type { ModuleRemoteEntry, QrPaymentMode, StoreConfig } from '../../types';
// Stateless leaf — no singleton to duplicate, so a direct import is fine here.
import { inspectRemoteManifest, type RemoteManifestInfo } from '../../modules/remoteVerify';

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
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false);
  const [enabledModules, setEnabledModules] = useState<Set<string>>(new Set());
  // TikTok LIVE account this store broadcasts from. Setting it is what lets the
  // `tiktok-live` module mint LIVE tokens for staff — see the backend
  // `POST /api/pos/live/session-token`.
  const [liveTiktokUsername, setLiveTiktokUsername] = useState('');
  // Only the string form (a source URL per bundled module) is edited here. Any
  // object-form entries — online-only modules (roadmap #13 Part C) — are held
  // aside and merged back on save so this screen never clobbers them.
  const [moduleRemotes, setModuleRemotes] = useState<Record<string, string>>({});
  const [remoteObjects, setRemoteObjects] = useState<Record<string, ModuleRemoteEntry>>({});
  const [remotesChanged, setRemotesChanged] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // ── Add an online-only module (roadmap #13 Part C) ──────────────────────
  // A new module id the shell ships no code for — the object form of
  // `module_remotes`. Mirrors the backend's `sanitizeModuleRemoteEntry`
  // (src/pos/core/modules.ts) closely enough to fail here instead of on save,
  // but the backend is still the real gate: a rejected entry just vanishes
  // from the response, same as an invalid bundled-module URL above.
  const [newModuleId, setNewModuleId] = useState('');
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newModuleUrl, setNewModuleUrl] = useState('');
  const [newModuleRoutePath, setNewModuleRoutePath] = useState('');
  const [newModuleIcon, setNewModuleIcon] = useState('');
  const [newModuleOrder, setNewModuleOrder] = useState('90');
  const [newModuleError, setNewModuleError] = useState<string | null>(null);

  // Reading the source's signed manifest (`inspectRemoteManifest`) tells us the
  // id and version the build declares about itself, so the owner does not retype
  // the id and can see which version a URL actually points at before saving.
  // Advisory only: the manifest is not fetched on save and never gates it — a
  // URL that is not published yet still saves.
  const [probe, setProbe] = useState<
    { state: 'idle' } | { state: 'busy' } | { state: 'ok'; info: RemoteManifestInfo } | { state: 'error'; message: string }
  >({ state: 'idle' });

  // Releasing a new version means repointing an existing entry at a new tag.
  // Without this the only route was delete-then-re-add.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUrl, setEditingUrl] = useState('');
  const [editingError, setEditingError] = useState<string | null>(null);
  const [editingProbe, setEditingProbe] = useState<
    { state: 'idle' } | { state: 'busy' } | { state: 'ok'; info: RemoteManifestInfo } | { state: 'error'; message: string }
  >({ state: 'idle' });

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
    setAutoPrintReceipt(store.auto_print_receipt);
    setEnabledModules(new Set(store.enabled_modules));
    setLiveTiktokUsername(store.live_tiktok_username ?? '');
    const strings: Record<string, string> = {};
    const objects: Record<string, ModuleRemoteEntry> = {};
    for (const [id, value] of Object.entries(store.module_remotes ?? {})) {
      if (typeof value === 'string') strings[id] = value;
      else objects[id] = value;
    }
    setModuleRemotes(strings);
    setRemoteObjects(objects);
  }

  function setModuleRemote(id: string, url: string) {
    setModuleRemotes((prev) => {
      const next = { ...prev };
      if (url.trim()) next[id] = url.trim();
      else delete next[id];
      return next;
    });
  }

  /** Mirrors backend `isAllowedRemoteUrl` — https://, root-relative /…, or http://localhost. */
  function isAllowedRemoteUrl(value: string): boolean {
    if (value.startsWith('/') && !value.startsWith('//')) return true;
    if (value.startsWith('https://')) return true;
    return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(value);
  }

  /**
   * Verify the signature on the source's manifest and report what it declares.
   * `expectId` is set when repointing an existing entry: the module's own id has
   * to keep matching the `module_remotes` key, or `applyModuleRemotes` rejects
   * the descriptor at runtime and the cashier falls back to the placeholder.
   */
  async function probeRemote(
    url: string,
    expectId: string | null
  ): Promise<{ state: 'ok'; info: RemoteManifestInfo } | { state: 'error'; message: string }> {
    if (!isAllowedRemoteUrl(url)) {
      return { state: 'error', message: 'Джерело: https://…, шлях від кореня /… або http://localhost.' };
    }
    try {
      const info = await inspectRemoteManifest(url);
      if (expectId && info.moduleId !== expectId) {
        return {
          state: 'error',
          message: `Джерело описує модуль «${info.moduleId}», а запис — «${expectId}».`,
        };
      }
      return { state: 'ok', info };
    } catch (err) {
      return { state: 'error', message: err instanceof Error ? err.message : 'Не вдалося перевірити джерело.' };
    }
  }

  async function checkNewModuleSource() {
    setProbe({ state: 'busy' });
    const result = await probeRemote(newModuleUrl.trim(), null);
    setProbe(result);
    // The manifest is authoritative about the id — fill it in rather than making
    // the owner copy it, and keep the key matching what the module calls itself.
    if (result.state === 'ok' && !newModuleId.trim()) setNewModuleId(result.info.moduleId);
  }

  function startEditingRemote(id: string, url: string) {
    setEditingId(id);
    setEditingUrl(url);
    setEditingError(null);
    setEditingProbe({ state: 'idle' });
  }

  function cancelEditingRemote() {
    setEditingId(null);
    setEditingUrl('');
    setEditingError(null);
    setEditingProbe({ state: 'idle' });
  }

  async function checkEditingSource() {
    if (!editingId) return;
    setEditingProbe({ state: 'busy' });
    setEditingProbe(await probeRemote(editingUrl.trim(), editingId));
  }

  /** Repoint one entry at a new build; everything else about it is untouched. */
  function applyEditingRemote() {
    if (!editingId) return;
    const url = editingUrl.trim();
    if (!isAllowedRemoteUrl(url)) {
      return setEditingError('Джерело: https://…, шлях від кореня /… або http://localhost.');
    }
    setRemoteObjects((prev) =>
      prev[editingId] ? { ...prev, [editingId]: { ...prev[editingId], url } } : prev
    );
    cancelEditingRemote();
  }

  function removeRemoteModule(id: string) {
    setRemoteObjects((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function addRemoteModule() {
    setNewModuleError(null);
    const id = newModuleId.trim();
    const url = newModuleUrl.trim();
    const title = newModuleTitle.trim();
    const routePath = newModuleRoutePath.trim();
    const order = Number(newModuleOrder);

    if (!/^[a-z][a-z0-9-]{1,40}$/.test(id)) {
      return setNewModuleError('Ідентифікатор: малі латинські літери, цифри, дефіс, з літери.');
    }
    if (
      MODULES.some((m) => m.id === id) ||
      id in moduleRemotes ||
      id in remoteObjects
    ) {
      return setNewModuleError(`Ідентифікатор «${id}» вже зайнято.`);
    }
    if (!title || title.length > 80) {
      return setNewModuleError('Назва: від 1 до 80 символів.');
    }
    if (!isAllowedRemoteUrl(url)) {
      return setNewModuleError('Джерело: https://…, шлях від кореня /… або http://localhost.');
    }
    if (!routePath || routePath.length > 120 || !/^\/[a-z0-9][a-z0-9/-]*$/.test(routePath)) {
      return setNewModuleError('Маршрут: з «/», малі латинські літери, цифри, «-», «/».');
    }
    if (!Number.isInteger(order)) {
      return setNewModuleError('Порядок у меню: ціле число.');
    }
    const icon = newModuleIcon.trim();
    if (icon && !/^[A-Za-z0-9]+$/.test(icon)) {
      return setNewModuleError('Іконка: ім’я lucide-компонента без пробілів (напр. Video).');
    }

    const entry: ModuleRemoteEntry = {
      url,
      title,
      routePath,
      nav: [
        {
          label: title,
          location: 'cashier-primary',
          order,
          match: routePath,
          ...(icon ? { icon } : {}),
        },
      ],
      ...(icon ? { icon } : {}),
    };
    setRemoteObjects((prev) => ({ ...prev, [id]: entry }));
    setProbe({ state: 'idle' });
    setNewModuleId('');
    setNewModuleTitle('');
    setNewModuleUrl('');
    setNewModuleRoutePath('');
    setNewModuleIcon('');
    setNewModuleOrder('90');
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
        auto_print_receipt: autoPrintReceipt,
        enabled_modules: [...enabledModules],
        module_remotes: { ...remoteObjects, ...moduleRemotes },
        live_tiktok_username: liveTiktokUsername.trim() || null,
        // Only send the key when the field is non-empty (empty = keep the stored one).
      });
      // Server sanitises `module_remotes` — a rejected entry disappears in the
      // response. Flag a reload if the effective map now differs from what this
      // tab loaded at boot (same check as the app-wide banner).
      setRemotesChanged(!sameRemoteMap(store.module_remotes));
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
              Під час приймання товару каса підтягує назву та бренд за штрихкодом із відкритих
              баз Open Food/Products/Beauty Facts і UPCitemdb. На роботу касира не впливає.
              Виправити чи прибрати конкретний запис — на сторінці «GTIN-довідник».
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

        {/* Its own endpoint and its own save button — see the card's header for
            why it must not join this page's single all-fields form. The guard
            keeps an older `@pos/platform` (or a test double) from crashing the
            whole settings screen on a method it does not have. */}
        {typeof api.fiscalSettings === 'function' && <FiscalSettingsCard />}

        <div className="bg-sq-surface border border-sq-divider rounded-sq p-5 space-y-4 shadow-sm">
          <div>
            <p className="sq-section-label">TikTok LIVE</p>
            <p className="text-sq-secondary text-sm mt-1">
              Нікнейм акаунта, з якого ви ведете прямі ефіри. Після збереження екран «Прямий
              ефір» працює і в касі, і тут — окремий вхід не потрібен.
            </p>
          </div>

          <label className="block">
            <span className="text-sm text-sq-secondary">Нікнейм TikTok</span>
            <input
              className="mt-1.5 w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sq-text"
              value={liveTiktokUsername}
              onChange={(e) => setLiveTiktokUsername(e.target.value)}
              placeholder="my_shop"
              autoComplete="off"
            />
            <span className="text-xs text-sq-muted mt-1 block">
              Без «@». Порожнє поле — магазин від’єднано від TikTok LIVE.
            </span>
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
            <div key={m.id} className="space-y-1.5">
              <label className="flex items-center gap-3">
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
              {enabledModules.has(m.id) && (
                <input
                  type="url"
                  inputMode="url"
                  placeholder="Джерело (URL) — типово вбудований"
                  value={moduleRemotes[m.id] ?? ''}
                  onChange={(e) => setModuleRemote(m.id, e.target.value)}
                  className="ml-7 w-[calc(100%-1.75rem)] rounded-sq border border-sq-divider bg-sq-bg px-2.5 py-1.5 text-xs text-sq-secondary"
                />
              )}
            </div>
          ))}

          <p className="text-sq-muted text-xs">
            Джерело (URL) вантажить модуль із окремої збірки під час завантаження вкладки
            (лише веб). Дозволені <code>https://</code>, шлях від кореня <code>/…</code> або
            <code>http://localhost</code>. Зміни потребують перезавантаження вкладки.
          </p>

          <div className="border-t border-sq-divider pt-4 space-y-3">
            <div>
              <p className="sq-section-label">Онлайн-модулі</p>
              <p className="text-sq-secondary text-sm mt-1">
                Модулі, під які застосунок каси не везе код, — завантажуються з вказаного джерела
                (напр. «Прямий ефір»). З'являться в касі після наступного входу.
              </p>
            </div>

            {Object.entries(remoteObjects).map(([id, entry]) => (
              <div
                key={id}
                className="rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 space-y-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {entry.title} <span className="text-xs text-sq-muted">({id})</span>
                    </div>
                    <div className="truncate text-xs text-sq-muted">
                      {entry.routePath} · {entry.url}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        editingId === id ? cancelEditingRemote() : startEditingRemote(id, entry.url)
                      }
                      className="rounded-sq border border-sq-divider px-2.5 py-1 text-xs text-sq-secondary hover:bg-sq-surface"
                    >
                      {editingId === id ? 'Скасувати' : 'Оновити джерело'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRemoteModule(id)}
                      className="rounded-sq border border-sq-divider px-2.5 py-1 text-xs text-sq-secondary hover:bg-sq-surface"
                    >
                      Видалити
                    </button>
                  </div>
                </div>

                {editingId === id && (
                  <div className="space-y-2 border-t border-sq-divider pt-2">
                    <input
                      aria-label={`Джерело модуля ${id}`}
                      placeholder="Джерело (URL remote-entry.js)"
                      value={editingUrl}
                      onChange={(e) => {
                        setEditingUrl(e.target.value);
                        setEditingProbe({ state: 'idle' });
                        setEditingError(null);
                      }}
                      className="w-full rounded-sq border border-sq-divider bg-sq-surface px-2.5 py-1.5 text-xs"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void checkEditingSource()}
                        disabled={editingProbe.state === 'busy'}
                        className="rounded-sq border border-sq-divider px-2.5 py-1 text-xs text-sq-secondary hover:bg-sq-surface disabled:opacity-50"
                      >
                        {editingProbe.state === 'busy' ? 'Перевірка…' : 'Перевірити'}
                      </button>
                      <button
                        type="button"
                        onClick={applyEditingRemote}
                        className="sq-btn-primary px-2.5 py-1 text-xs"
                      >
                        Застосувати
                      </button>
                      <RemoteProbeNote probe={editingProbe} />
                    </div>
                    {editingError && <p className="text-xs text-rose-600">{editingError}</p>}
                  </div>
                )}
              </div>
            ))}

            <div className="space-y-2 rounded-sq border border-dashed border-sq-divider p-3">
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Ідентифікатор (tiktok-live)"
                  value={newModuleId}
                  onChange={(e) => setNewModuleId(e.target.value)}
                  className="rounded-sq border border-sq-divider bg-sq-surface px-2.5 py-1.5 text-xs"
                />
                <input
                  placeholder="Назва (Прямий ефір)"
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  className="rounded-sq border border-sq-divider bg-sq-surface px-2.5 py-1.5 text-xs"
                />
                <input
                  placeholder="Джерело (URL remote-entry.js)"
                  value={newModuleUrl}
                  onChange={(e) => {
                    setNewModuleUrl(e.target.value);
                    setProbe({ state: 'idle' });
                  }}
                  className="col-span-2 rounded-sq border border-sq-divider bg-sq-surface px-2.5 py-1.5 text-xs"
                />
                <div className="col-span-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void checkNewModuleSource()}
                    disabled={probe.state === 'busy' || !newModuleUrl.trim()}
                    className="rounded-sq border border-sq-divider px-2.5 py-1 text-xs text-sq-secondary hover:bg-sq-surface disabled:opacity-50"
                  >
                    {probe.state === 'busy' ? 'Перевірка…' : 'Перевірити джерело'}
                  </button>
                  <RemoteProbeNote probe={probe} />
                </div>
                <input
                  placeholder="Маршрут (/live)"
                  value={newModuleRoutePath}
                  onChange={(e) => setNewModuleRoutePath(e.target.value)}
                  className="rounded-sq border border-sq-divider bg-sq-surface px-2.5 py-1.5 text-xs"
                />
                <input
                  placeholder="Іконка lucide (Video) — необов'язково"
                  value={newModuleIcon}
                  onChange={(e) => setNewModuleIcon(e.target.value)}
                  className="rounded-sq border border-sq-divider bg-sq-surface px-2.5 py-1.5 text-xs"
                />
                <input
                  type="number"
                  placeholder="Порядок у меню"
                  value={newModuleOrder}
                  onChange={(e) => setNewModuleOrder(e.target.value)}
                  className="col-span-2 rounded-sq border border-sq-divider bg-sq-surface px-2.5 py-1.5 text-xs"
                />
              </div>
              {newModuleError && <p className="text-xs text-rose-600">{newModuleError}</p>}
              <button
                type="button"
                onClick={addRemoteModule}
                className="rounded-sq border border-sq-divider px-3 py-1.5 text-xs font-medium text-sq-secondary hover:bg-sq-surface"
              >
                + Додати модуль
              </button>
            </div>
          </div>
        </div>

        {remotesChanged && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-sq-secondary">Джерело модулів змінилося.</span>
            <button
              type="button"
              className="sq-btn-primary px-3 py-1.5"
              onClick={() => window.location.reload()}
            >
              Перезавантажити
            </button>
          </div>
        )}
        {message && <p className="text-sm text-sq-blue font-medium">{message}</p>}
        <button type="submit" className="sq-btn-primary px-4 py-2.5">
          Зберегти
        </button>
      </form>
    </div>
  );
}

/**
 * Result of reading a source's signed manifest. Deliberately advisory: it says
 * what the build declares and whether its signature checks out, but nothing
 * here blocks saving — a URL for a version that is not published yet is a
 * legitimate thing to store.
 */
function RemoteProbeNote({
  probe,
}: {
  probe:
    | { state: 'idle' }
    | { state: 'busy' }
    | { state: 'ok'; info: RemoteManifestInfo }
    | { state: 'error'; message: string };
}) {
  if (probe.state === 'ok') {
    return (
      <span className="text-xs text-emerald-700">
        Підпис дійсний · {probe.info.moduleId} {probe.info.version}
      </span>
    );
  }
  if (probe.state === 'error') {
    return <span className="text-xs text-rose-600">{probe.message}</span>;
  }
  return null;
}
