// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, useAuthStore, sameRemoteMap, useVertical, PLATFORM_VERSION } from '@pos/platform';
import { ProductPhotoField } from '../../components/ProductPhotoField';
import { PageHeader, SectionHead } from '../../components/ui/Page';
import { Plus, Settings } from '../../platform/glyphs';
import { FiscalSettingsCard } from './FiscalSettingsCard';
import { MODULES } from '../../modules/registry';
import { SlotBoundary } from '../../modules/SlotBoundary';
import { reportModuleEvent } from '../../modules/telemetry';
import { resolveSettingsCard } from '../../modules/verticals';
import type { ModuleRemoteEntry, QrPaymentMode, StoreConfig } from '../../types';
// Stateless leaf — no singleton to duplicate, so a direct import is fine here.
import { inspectRemoteManifest, type RemoteManifestInfo } from '../../modules/remoteVerify';
import { validateRemoteEntryInput } from '../../lib/moduleRemoteForm';

export function SettingsPage() {
  const auth = useAuthStore((s) => s.auth);
  const [name, setName] = useState(auth?.store.name ?? '');
  const [slug, setSlug] = useState(auth?.store.slug ?? '');
  const vertical = useVertical();
  // Whatever this kind of shop has to configure and the others do not — first
  // of them is the florist's assembly charge, which used to be on this page
  // for every store (see `modules/verticals.ts`).
  const settingsCard = useMemo(() => resolveSettingsCard(vertical.id), [vertical.id]);
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
  // Percent in the field, basis points on the wire — the owner thinks in
  // percent and the column is exact.
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

    const result = validateRemoteEntryInput({
      id,
      title,
      url,
      routePath,
      order,
      icon: newModuleIcon,
      takenIds: new Set([...MODULES.map((m) => m.id), ...Object.keys(moduleRemotes), ...Object.keys(remoteObjects)]),
    });
    if (!result.ok) return setNewModuleError(result.error);
    const entry = result.entry;
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
    <div className="space-y-8 animate-fade-up max-w-2xl text-sq-text">
      <PageHeader glyph={Settings} title="Налаштування" subtitle="Базові параметри магазину." />

      <form onSubmit={onSave} className="space-y-9">
        <section>
          <SectionHead title="Магазин" />
          <div className="pt-4 space-y-4">
            <Field label="Назва магазину">
              <input className="sq-input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 items-start">
              <Field label="Код для PIN-входу">
                <input className="sq-input" value={slug} disabled />
              </Field>
              <Field
                label="Тип магазину"
                hint="Визначає поля товару та екран продажу. Змінює адміністратор платформи."
              >
                <input className="sq-input" value={vertical.title} disabled />
              </Field>
            </div>
            <p className="text-[15px] text-sq-secondary">Валюта: грн (UAH)</p>
          </div>
        </section>

        {/* Whatever this kind of shop configures and the others do not. It sits
            here because «Тип магазину» is directly above it, and it carries its
            own «Зберегти»: the card is the module's, the form is the host's.
            A module that never loaded adds nothing — this page is the host's
            and a failing CDN must not be able to take it down. */}
        {settingsCard && (
          <SlotBoundary
            fallback={null}
            onError={(err) =>
              reportModuleEvent({
                type: 'settings_card_error',
                moduleId: settingsCard.moduleId,
                vertical: vertical.id,
                error: err,
              })
            }
          >
            <Suspense fallback={<div className="h-28" />}>
              <settingsCard.Card />
            </Suspense>
          </SlotBoundary>
        )}

        <section>
          <SectionHead title="QR-код оплата" />
          <div className="pt-3 space-y-4">
            <SectionLead>
              Каса приймає оплату по QR без автоматичного підтвердження — касир перевіряє успішність
              у застосунку покупця.
            </SectionLead>

            <Toggle checked={qrEnabled} onChange={setQrEnabled}>
              Показувати «QR-код» на екрані оплати
            </Toggle>

            <Field label="Режим">
              <select
                className="sq-input"
                value={qrMode}
                onChange={(e) => setQrMode(e.target.value as QrPaymentMode)}
              >
                <option value="static">Статичний — завантажене зображення QR</option>
                <option value="dynamic">Динамічний — QR з точною сумою (Opendatabot)</option>
              </select>
            </Field>

            <ProductPhotoField
              label="Зображення QR (статичний режим)"
              value={qrImageUrl}
              onChange={setQrImageUrl}
            />

            {qrMode === 'dynamic' && (
              <div className="grid gap-4 sm:grid-cols-2 pt-1">
                <Field label="IBAN отримувача">
                  <input
                    className="sq-input"
                    value={qrIban}
                    onChange={(e) => setQrIban(e.target.value)}
                    placeholder="UA…"
                  />
                </Field>
                <Field label="ЄДРПОУ / РНОКПП">
                  <input className="sq-input" value={qrEdrpou} onChange={(e) => setQrEdrpou(e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Отримувач">
                    <input
                      className="sq-input"
                      value={qrRecipient}
                      onChange={(e) => setQrRecipient(e.target.value)}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field
                    label="Призначення платежу (шаблон)"
                    hint={<>Плейсхолдери: {'{ref}'} — номер чека, {'{store}'} — назва магазину.</>}
                  >
                    <input
                      className="sq-input"
                      value={qrPurposeTemplate}
                      onChange={(e) => setQrPurposeTemplate(e.target.value)}
                      placeholder="Оплата, чек {ref}, {store}"
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          <SectionHead title="Штрихкоди (GTIN)" />
          <div className="pt-3 space-y-3">
            <SectionLead>
              Під час приймання товару каса підтягує назву та бренд за штрихкодом із відкритих
              баз Open Food/Products/Beauty Facts і UPCitemdb. На роботу касира не впливає.
              Виправити чи прибрати конкретний запис — на сторінці «GTIN-довідник».
            </SectionLead>

            <Toggle checked={gtinLookupEnabled} onChange={setGtinLookupEnabled}>
              Шукати товар за штрихкодом
            </Toggle>
          </div>
        </section>

        <section>
          <SectionHead title="Друк чеків" />
          <div className="pt-3 space-y-3">
            <SectionLead>
              Працює лише на робочому місці каси з налаштованим чековим принтером
              (десктоп-застосунок). У браузері та без принтера чек не друкується автоматично.
            </SectionLead>

            <Toggle checked={autoPrintReceipt} onChange={setAutoPrintReceipt}>
              Автоматично друкувати чек після продажу
            </Toggle>
          </div>
        </section>

        {/* Its own endpoint and its own save button — see the card's header for
            why it must not join this page's single all-fields form. The guard
            keeps an older `@pos/platform` (or a test double) from crashing the
            whole settings screen on a method it does not have. */}
        {typeof api.fiscalSettings === 'function' && <FiscalSettingsCard />}

        <section>
          <SectionHead title="TikTok LIVE" />
          <div className="pt-3 space-y-4">
            <SectionLead>
              Нікнейм акаунта, з якого ви ведете прямі ефіри. Після збереження екран «Прямий
              ефір» працює і в касі, і тут — окремий вхід не потрібен.
            </SectionLead>

            <Field label="Нікнейм TikTok" hint="Без «@». Порожнє поле — магазин від’єднано від TikTok LIVE.">
              <input
                className="sq-input"
                value={liveTiktokUsername}
                onChange={(e) => setLiveTiktokUsername(e.target.value)}
                placeholder="my_shop"
                autoComplete="off"
              />
            </Field>
          </div>
        </section>

        <section>
          <SectionHead title="Модулі магазину" />
          <div className="pt-3 space-y-3">
            <SectionLead>
              Вимкнений модуль зникає з меню й стає недоступним у касі та адмінці. Каси
              підхоплять зміни після наступного входу. Назву, порядок та іконку пунктів
              меню змінюють на сторінці <Link to="/admin/appearance" className="sq-link">
              «Вигляд меню»</Link>.
            </SectionLead>

            <ul>
              {/*
                A vertical module is not something an owner chooses here — the sell
                screen renders whichever one matches «Тип магазину» above, and the
                bundled clothing catalog is the fallback. Listing it as "always on"
                would invite the question of how to turn it off.
              */}
              {MODULES.filter((m) => m.core && !m.id.startsWith('vertical-')).map((m) => (
                <li key={m.id} className="sq-row">
                  <label className="min-h-11 py-1.5 flex items-center gap-3">
                    <input type="checkbox" checked disabled className={`${CHECKBOX} opacity-50`} />
                    <span className="flex-1 min-w-0 text-[15px] text-sq-secondary">{m.title}</span>
                    <span className="h-[22px] px-2 rounded-md ring-1 ring-inset ring-sq-divider text-xs font-medium text-sq-secondary inline-flex items-center shrink-0">
                      завжди увімкнено
                    </span>
                  </label>
                </li>
              ))}

              {MODULES.filter((m) => !m.core && m.id !== 'live-selling').map((m) => (
                <li key={m.id} className="sq-row">
                  <label className="min-h-11 py-1.5 flex items-center gap-3">
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
                      className={CHECKBOX}
                    />
                    <span className="flex-1 min-w-0 text-[15px] text-sq-text">{m.title}</span>
                  </label>
                  {enabledModules.has(m.id) && (
                    <div className="pl-8 pb-3">
                      <input
                        type="url"
                        inputMode="url"
                        placeholder="Джерело (URL) — типово вбудований"
                        value={moduleRemotes[m.id] ?? ''}
                        onChange={(e) => setModuleRemote(m.id, e.target.value)}
                        className="sq-input"
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <p className="text-[13px] leading-relaxed text-sq-muted">
              Джерело (URL) вантажить модуль із окремої збірки під час завантаження — на сайті
              та в десктоп-касі (каса тримає перевірену копію в кеші, тому працює і офлайн).
              Дозволені <code>https://</code>, шлях від кореня <code>/…</code> або
              <code>http://localhost</code>. Збірка, зроблена під новішу платформу, ніж у
              застосунку, не завантажиться — лишиться вбудований модуль. Зміни потребують
              перезавантаження.
            </p>
          </div>
        </section>

        <section>
          <SectionHead title="Онлайн-модулі" />
          <div className="pt-3 space-y-4">
            <SectionLead>
              Модулі, під які застосунок каси не везе код, — завантажуються з вказаного джерела
              (напр. «Прямий ефір»). З'являться в касі після наступного входу.
            </SectionLead>

            {Object.entries(remoteObjects).length > 0 && (
              <div className="space-y-2">
                {Object.entries(remoteObjects).map(([id, entry]) => (
                  <div key={id} className="rounded-sq bg-sq-sidebar px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold text-sq-text">
                          {entry.title} <span className="text-[13px] font-normal text-sq-muted">({id})</span>
                        </div>
                        <div className="truncate text-[13px] text-sq-muted">
                          {entry.routePath} · {entry.url}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <button
                          type="button"
                          onClick={() =>
                            editingId === id ? cancelEditingRemote() : startEditingRemote(id, entry.url)
                          }
                          className="min-h-9 text-[15px] font-semibold text-sq-blue"
                        >
                          {editingId === id ? 'Скасувати' : 'Оновити джерело'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRemoteModule(id)}
                          className="min-h-9 text-[15px] font-semibold text-red-600"
                        >
                          Видалити
                        </button>
                      </div>
                    </div>

                    {editingId === id && (
                      <div className="space-y-2">
                        <input
                          aria-label={`Джерело модуля ${id}`}
                          placeholder="Джерело (URL remote-entry.js)"
                          value={editingUrl}
                          onChange={(e) => {
                            setEditingUrl(e.target.value);
                            setEditingProbe({ state: 'idle' });
                            setEditingError(null);
                          }}
                          // A grey well on the grey panel would vanish; white keeps it a field.
                          className="sq-input !bg-sq-surface"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void checkEditingSource()}
                            disabled={editingProbe.state === 'busy'}
                            className="sq-btn-quiet"
                          >
                            {editingProbe.state === 'busy' ? 'Перевірка…' : 'Перевірити'}
                          </button>
                          <button
                            type="button"
                            onClick={applyEditingRemote}
                            className="sq-btn-primary min-h-11 px-4 text-[15px]"
                          >
                            Застосувати
                          </button>
                          <RemoteProbeNote probe={editingProbe} />
                        </div>
                        {editingError && <p className="text-[13px] text-red-600">{editingError}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  placeholder="Ідентифікатор (tiktok-live)"
                  value={newModuleId}
                  onChange={(e) => setNewModuleId(e.target.value)}
                  className="sq-input"
                />
                <input
                  placeholder="Назва (Прямий ефір)"
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  className="sq-input"
                />
                <input
                  placeholder="Джерело (URL remote-entry.js)"
                  value={newModuleUrl}
                  onChange={(e) => {
                    setNewModuleUrl(e.target.value);
                    setProbe({ state: 'idle' });
                  }}
                  className="sq-input sm:col-span-2"
                />
                <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void checkNewModuleSource()}
                    disabled={probe.state === 'busy' || !newModuleUrl.trim()}
                    className="sq-btn-quiet"
                  >
                    {probe.state === 'busy' ? 'Перевірка…' : 'Перевірити джерело'}
                  </button>
                  <RemoteProbeNote probe={probe} />
                </div>
                <input
                  placeholder="Маршрут (/live)"
                  value={newModuleRoutePath}
                  onChange={(e) => setNewModuleRoutePath(e.target.value)}
                  className="sq-input"
                />
                <input
                  placeholder="Іконка, назвою (Video) — необов'язково"
                  value={newModuleIcon}
                  onChange={(e) => setNewModuleIcon(e.target.value)}
                  className="sq-input"
                />
                <input
                  type="number"
                  placeholder="Порядок у меню"
                  value={newModuleOrder}
                  onChange={(e) => setNewModuleOrder(e.target.value)}
                  className="sq-input sm:col-span-2"
                />
              </div>
              {newModuleError && <p className="text-[13px] text-red-600">{newModuleError}</p>}
              <button
                type="button"
                onClick={addRemoteModule}
                className="inline-flex items-center gap-1.5 min-h-9 text-[15px] font-semibold text-sq-blue"
              >
                <Plus size={20} />
                Додати модуль
              </button>
            </div>
          </div>
        </section>

        <div className="space-y-4 pt-1">
          {remotesChanged && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-800">
              <span className="flex-1 min-w-0">Джерело модулів змінилося.</span>
              <button type="button" className="sq-btn-quiet" onClick={() => window.location.reload()}>
                Перезавантажити
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="pos-btn-primary min-h-11 px-5 rounded-sq text-[15px]">
              Зберегти
            </button>
            {message && (
              <p
                className={`text-[15px] font-medium ${
                  message === 'Збережено' ? 'text-sq-success-ink' : 'text-red-600'
                }`}
              >
                {message}
              </p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

/** Native checkbox in the accent colour, sized to sit on a 15 px text line. */
const CHECKBOX = 'w-5 h-5 shrink-0 accent-[rgb(var(--sq-blue-rgb))]';

/** A label over its control, the way every owner form reads. */
function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-sq-secondary">{label}</span>
      {children}
      {hint && <span className="text-[13px] text-sq-muted">{hint}</span>}
    </label>
  );
}

/** A checkbox row: the box, then the sentence it switches. */
function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="min-h-11 flex items-center gap-3 text-[15px] text-sq-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={CHECKBOX}
      />
      <span>{children}</span>
    </label>
  );
}

/** The quiet sentence under a section head that says what the section is for. */
function SectionLead({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-sq-secondary">{children}</p>;
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
    // A build that needs a newer host than this site has will be refused at
    // load time (`verifyRemoteEntry`); the desktop cashier refuses it in Rust.
    // Saving is still allowed — the entry starts working once the apps update.
    const needsNewer = probe.info.minHostPlatform > PLATFORM_VERSION;
    return (
      <span className={`text-[13px] ${needsNewer ? 'text-amber-700' : 'text-sq-success-ink'}`}>
        Підпис дійсний · {probe.info.moduleId} {probe.info.version}
        {needsNewer &&
          ` · потребує платформу ${probe.info.minHostPlatform}, тут ${PLATFORM_VERSION} — сайт і касу треба оновити, доти лишиться вбудований модуль`}
      </span>
    );
  }
  if (probe.state === 'error') {
    return <span className="text-[13px] text-red-600">{probe.message}</span>;
  }
  return null;
}
