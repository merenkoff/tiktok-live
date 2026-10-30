// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/pages/admin/PublicMenuCard.tsx
//
// The owner's «QR-меню»: a switch, the address, and the QR card to print —
// and, since migration 080, a short address by the store code for a social-
// network bio («Коротка адреса»). TechDocs/POS_QR_MENU.md.
//
// Its own card with its own calls, outside `SettingsPage`'s single form, for
// the reason `FiscalSettingsCard` gives: a different endpoint (`/store/
// public-menu`), and turning the menu on has a side effect a plain field does
// not — the server issues the address. It lives in the HOST, not in the café
// module: a card in the `vertical-cafe` remote would need a module release and
// a per-store repoint for a screen only the owner ever opens, and would vanish
// with the CDN.
//
// Reached through `api.posRequest` rather than a named method, so the
// `@pos/platform` surface — and the version every frozen desktop till checks a
// module against — does not move for a settings card.
//
// A seller gets 403 and sees nothing; a store whose vertical has no kitchen
// sees nothing either. Only the address prints on the QR card the SERVER draws
// (`/m/<token>/qr`), so this page needs no QR library.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@pos/platform';
import { formatUahCompact } from '../../lib/money';
import { SectionHead } from '../../components/ui/Page';
import { GuestAutoKitchen, type AutoKitchenMode } from './GuestAutoKitchen';

interface PublicMenuSettings {
  /** This kind of store can publish a menu at all. */
  available: boolean;
  enabled: boolean;
  token: string | null;
  url: string | null;
  /**
   * Live tables the store has (phase Q2). Absent from an older backend, which
   * is the same as none: the sheet is offered only when there is one.
   */
  tables?: number;
  /**
   * The guest may read the bill of their own table (phase Q5). Absent from an
   * older backend, which is the same as off — and then there is nothing to switch.
   */
  bill_enabled?: boolean;
  /**
   * The guest may send dishes to a waiter, who accepts them (phase Q6). Absent
   * from an older backend, which is the same as off.
   */
  ordering_enabled?: boolean;
  /**
   * Guests at a keyed table may call a waiter or ask for the bill (phase Q8).
   * Absent from an older backend — then there is no switch to show.
   */
  call_enabled?: boolean;
  /**
   * Where a guest's order goes (phase Q9): to a waiter first, or straight to
   * the kitchen for tables already served / always. Absent from an older
   * backend, which only knows the waiter.
   */
  auto_kitchen?: AutoKitchenMode;
  /** An order dearer than this waits for a waiter whatever the mode. */
  auto_limit_cents?: number;
  /** When the owner last confirmed the risks of raising the mode. */
  auto_ack_at?: string | null;
  /**
   * The menu also answers at `/m/<store code>` — a short link for a social-
   * network bio (migration 080). Absent from an older backend: no box then.
   */
  slug_enabled?: boolean;
  /** That short address, shown before the box is ticked; null if the code cannot be one. */
  slug_url?: string | null;
  /**
   * A short-lived signed suffix (`?p=`) that makes the print pages write each
   * table's key into its QR. Without it the QR still opens the menu, but not
   * the bill.
   */
  print?: string | null;
}

/** What the server's print link looks like; anything else is not appended to a URL. */
const PRINT_LINK = /^\d{9,12}\.[A-Za-z0-9_-]{43}$/;

type LoadState = 'loading' | 'ready' | 'hidden' | 'error';

const CHECKBOX = 'w-5 h-5 shrink-0 accent-[rgb(var(--sq-blue-rgb))]';

function errorText(error: unknown): string {
  const res = (error as { response?: { status?: number; data?: { error?: string } } }).response;
  if (res?.status === 403) return 'Лише власник магазину може змінювати це.';
  return res?.data?.error || 'Не вдалося зберегти. Спробуйте ще раз.';
}

export function PublicMenuCard() {
  const [state, setState] = useState<LoadState>('loading');
  const [settings, setSettings] = useState<PublicMenuSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const slugInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const view = await api.posRequest<PublicMenuSettings>('get', '/store/public-menu');
      setSettings(view);
      setState(view.available ? 'ready' : 'hidden');
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      // Owner-only endpoint: a seller simply does not see the card.
      setState(status === 403 ? 'hidden' : 'error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(call: () => Promise<PublicMenuSettings>, done: (view: PublicMenuSettings) => string) {
    setSaving(true);
    setMessage(null);
    try {
      const view = await call();
      setSettings(view);
      setMessage(done(view));
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setSaving(false);
      setConfirmRotate(false);
    }
  }

  const toggle = (enabled: boolean) =>
    run(
      () => api.posRequest<PublicMenuSettings>('patch', '/store/public-menu', { enabled }),
      (view) => (view.enabled ? 'Меню відкрито для гостей.' : 'Меню вимкнено: за QR тепер нічого не відкриється.')
    );

  const toggleSlug = (enabled: boolean) =>
    run(
      () => api.posRequest<PublicMenuSettings>('patch', '/store/public-menu', { slug_enabled: enabled }),
      (view) =>
        view.slug_enabled
          ? 'Коротка адреса працює — її можна ставити в соцмережі.'
          : 'Коротку адресу вимкнено. Звичайне посилання й QR працюють як і раніше.'
    );

  const toggleBill = (enabled: boolean) =>
    run(
      () => api.posRequest<PublicMenuSettings>('patch', '/store/public-menu', { bill_enabled: enabled }),
      (view) =>
        view.bill_enabled
          ? 'Гість, що відсканував QR свого столу, бачитиме рахунок.'
          : 'Рахунок гостям більше не показується.'
    );

  const toggleOrdering = (enabled: boolean) => {
    // Switching ordering off resets auto-sending on the server; say so when it was on.
    const wasAuto = settings?.auto_kitchen === 'reorders' || settings?.auto_kitchen === 'all';
    return run(
      () => api.posRequest<PublicMenuSettings>('patch', '/store/public-menu', { ordering_enabled: enabled }),
      (view) =>
        view.ordering_enabled
          ? 'Гості зможуть надсилати замовлення — вони з’являться в офіціанта.'
          : 'Замовлення з телефону вимкнено. Запити, що вже чекають, офіціант ще може прийняти.' +
            (wasAuto ? ' Автовідправку на кухню теж вимкнено.' : '')
    );
  };

  const toggleCall = (enabled: boolean) =>
    run(
      () => api.posRequest<PublicMenuSettings>('patch', '/store/public-menu', { call_enabled: enabled }),
      (view) =>
        view.call_enabled
          ? 'Гості за столом зможуть покликати офіціанта й попросити рахунок.'
          : 'Кнопки виклику з меню гостей прибрано.'
    );

  const setAutoKitchen = (mode: AutoKitchenMode, ack: boolean) =>
    run(
      () =>
        api.posRequest<PublicMenuSettings>(
          'patch',
          '/store/public-menu',
          ack ? { auto_kitchen: mode, auto_kitchen_ack: true } : { auto_kitchen: mode }
        ),
      (view) =>
        view.auto_kitchen === 'all'
          ? 'Замовлення гостей тепер ідуть одразу на кухню, а офіціант отримує сповіщення.'
          : view.auto_kitchen === 'reorders'
            ? 'Дозамовлення столів, які вже обслуговуються, тепер ідуть одразу на кухню.'
            : 'Кожне замовлення гостя знову спершу приймає офіціант.'
    );

  const setAutoLimit = (cents: number) =>
    run(
      () => api.posRequest<PublicMenuSettings>('patch', '/store/public-menu', { auto_limit_cents: cents }),
      (view) =>
        `Замовлення понад ${formatUahCompact(view.auto_limit_cents ?? cents)} чекатимуть офіціанта.`
    );

  const rotate = () =>
    run(
      () => api.posRequest<PublicMenuSettings>('post', '/store/public-menu/rotate'),
      () => 'Створено нове посилання. Старі QR більше не працюють — роздрукуйте новий.'
    );

  async function copy(url: string | null | undefined, input: HTMLInputElement | null) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Посилання скопійовано.');
    } catch {
      // No clipboard permission (an insecure origin, an embedded webview):
      // select the text, so the owner's own Ctrl+C finishes the job.
      input?.select();
      setMessage('Виділено посилання — скопіюйте його вручну.');
    }
  }

  if (state === 'hidden' || state === 'loading') return null;

  if (state === 'error' || !settings) {
    return (
      <section>
        <SectionHead title="QR-меню для гостей" />
        <div className="pt-3 space-y-3">
          <p className="text-[15px] text-sq-secondary">Не вдалося завантажити налаштування меню.</p>
          <button type="button" className="sq-btn-quiet" onClick={() => void load()}>
            Спробувати ще раз
          </button>
        </div>
      </section>
    );
  }

  const live = settings.enabled && settings.url;
  // The short address only works while the menu is published, so the box sits
  // with it — and stays once ticked, so an owner can always untick it.
  const slugUrl = typeof settings.slug_url === 'string' ? settings.slug_url : null;
  const showSlugSwitch =
    typeof settings.slug_enabled === 'boolean' && slugUrl !== null && (Boolean(live) || settings.slug_enabled);
  const tables = settings.tables ?? 0;
  const print = typeof settings.print === 'string' && PRINT_LINK.test(settings.print) ? settings.print : null;
  // The switch is about tables, so it shows where there are some — and stays
  // visible once on, so an owner can always turn it off.
  const showBillSwitch = tables > 0 || settings.bill_enabled === true;
  const showOrderingSwitch = tables > 0 || settings.ordering_enabled === true;
  // Phases Q8/Q9 exist only where the backend reports their fields.
  const showCallSwitch = typeof settings.call_enabled === 'boolean' && (tables > 0 || settings.call_enabled);
  const autoMode: AutoKitchenMode | null =
    settings.auto_kitchen === 'off' || settings.auto_kitchen === 'reorders' || settings.auto_kitchen === 'all'
      ? settings.auto_kitchen
      : null;

  return (
    <section>
      <SectionHead title="QR-меню для гостей" />
      <div className="pt-3 space-y-4">
        <p className="text-[15px] leading-relaxed text-sq-secondary">
          Гість сканує QR на столі чи біля стійки й бачить меню з цінами на телефоні — без
          застосунку. Що ви поставили в стоп-лист на касі, на його екрані сіріє одразу.
        </p>

        <label className="min-h-11 flex items-center gap-3 text-[15px] text-sq-text">
          <input
            type="checkbox"
            className={CHECKBOX}
            checked={settings.enabled}
            disabled={saving}
            onChange={(e) => void toggle(e.target.checked)}
          />
          <span>Показувати меню гостям</span>
        </label>

        {live && (
          <div className="space-y-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-sq-secondary">Посилання на меню</span>
              <input
                ref={urlInput}
                className="sq-input"
                value={settings.url ?? ''}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
            <div className="flex flex-wrap gap-2.5">
              <a className="sq-btn-primary" href={`${settings.url}/qr`} target="_blank" rel="noopener noreferrer">
                Друкувати QR
              </a>
              {tables > 0 && (
                // One page with a card for every table, each QR carrying its
                // table's number — and, with the print link, its key. Server-
                // drawn, so this card needs no library.
                <a
                  className="sq-btn-quiet"
                  href={`${settings.url}/tables${print ? `?p=${print}` : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  QR для всіх столів ({tables})
                </a>
              )}
              <a className="sq-btn-quiet" href={settings.url ?? undefined} target="_blank" rel="noopener noreferrer">
                Відкрити меню
              </a>
              <button type="button" className="sq-btn-quiet" onClick={() => void copy(settings.url, urlInput.current)}>
                Копіювати посилання
              </button>
            </div>
          </div>
        )}

        {showSlugSwitch && (
          <div className="space-y-1.5">
            <label className="min-h-11 flex items-center gap-3 text-[15px] text-sq-text">
              <input
                type="checkbox"
                className={CHECKBOX}
                checked={settings.slug_enabled === true}
                disabled={saving}
                onChange={(e) => void toggleSlug(e.target.checked)}
              />
              <span>Коротка адреса для соцмереж: {slugUrl?.replace(/^https?:\/\//, '')}</span>
            </label>
            <p className="pl-8 text-[13px] leading-relaxed text-sq-muted">
              Зручно для Instagram, Facebook чи Google Maps: меню відкривається за кодом магазину. Звичайне
              посилання й роздруковані QR працюють і далі. Цей самий код касири вводять при вході, тому без
              PIN-коду він нічого, крім меню, не відкриває — але давайте працівникам PIN, який не вгадати.
            </p>
            {settings.slug_enabled === true && live && (
              <div className="pl-8 space-y-2.5">
                <input
                  ref={slugInput}
                  className="sq-input"
                  aria-label="Коротка адреса меню"
                  value={slugUrl ?? ''}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    className="sq-btn-quiet"
                    onClick={() => void copy(slugUrl, slugInput.current)}
                  >
                    Копіювати коротку адресу
                  </button>
                  <a className="sq-btn-quiet" href={slugUrl ?? undefined} target="_blank" rel="noopener noreferrer">
                    Відкрити за короткою адресою
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {showBillSwitch && (
          <div className="space-y-1.5">
            <label className="min-h-11 flex items-center gap-3 text-[15px] text-sq-text">
              <input
                type="checkbox"
                className={CHECKBOX}
                checked={settings.bill_enabled === true}
                disabled={saving}
                onChange={(e) => void toggleBill(e.target.checked)}
              />
              <span>Показувати гостю рахунок його столу</span>
            </label>
            <p className="pl-8 text-[13px] leading-relaxed text-sq-muted">
              Гість, що відсканував QR свого столу, бачить, що вже пішло на кухню, і суму до сплати. Рахунок
              відкривається лише за ключем, який лежить у QR столу: друкуйте QR кнопкою «QR для всіх столів» —
              старі роздруківки без ключа відкриють меню, але не рахунок.
            </p>
          </div>
        )}

        {showOrderingSwitch && (
          <div className="space-y-1.5">
            <label className="min-h-11 flex items-center gap-3 text-[15px] text-sq-text">
              <input
                type="checkbox"
                className={CHECKBOX}
                checked={settings.ordering_enabled === true}
                disabled={saving}
                onChange={(e) => void toggleOrdering(e.target.checked)}
              />
              <span>Приймати замовлення гостей з телефону</span>
            </label>
            <p className="pl-8 text-[13px] leading-relaxed text-sq-muted">
              {autoMode === 'reorders' || autoMode === 'all'
                ? 'Гість додає страви з меню свого столу й надсилає замовлення; куди воно йде далі — обрано нижче.'
                : 'Гість додає страви з меню свого столу й надсилає запит; на кухню нічого не йде, доки офіціант не прийме його.'}{' '}
              Вмикайте, коли офіціанти вже мають оновлений модуль «Столи» (запити з’являються на плитці столу) —
              інакше їх ніхто не побачить.
            </p>
            {settings.ordering_enabled === true && autoMode !== null && (
              <GuestAutoKitchen
                mode={autoMode}
                limitCents={settings.auto_limit_cents ?? 200000}
                ackAt={settings.auto_ack_at ?? null}
                saving={saving}
                onMode={setAutoKitchen}
                onLimit={setAutoLimit}
              />
            )}
          </div>
        )}

        {showCallSwitch && (
          <div className="space-y-1.5">
            <label className="min-h-11 flex items-center gap-3 text-[15px] text-sq-text">
              <input
                type="checkbox"
                className={CHECKBOX}
                checked={settings.call_enabled === true}
                disabled={saving}
                onChange={(e) => void toggleCall(e.target.checked)}
              />
              <span>Кнопки «Покликати офіціанта» і «Попросити рахунок»</span>
            </label>
            <p className="pl-8 text-[13px] leading-relaxed text-sq-muted">
              Гість за столом кличе офіціанта або просить рахунок з телефону, а офіціант бачить виклик на плані
              залу й відповідає «Іду». Працює лише за QR столу з ключем — друкуйте QR кнопкою «QR для всіх
              столів». Вмикайте, коли офіціанти вже мають модуль «Столи», що показує виклики, — інакше на
              виклик ніхто не прийде.
            </p>
          </div>
        )}

        {settings.token && (
          <div className="rounded-xl bg-sq-sidebar px-[18px] py-4 space-y-3">
            <p className="text-[15px] text-sq-text">
              Потрапило посилання не тим людям? Створіть нове: старі QR перестануть працювати.
              {settings.slug_enabled === true && ' Коротка адреса не зміниться — щоб її прибрати, зніміть галочку вище.'}
            </p>
            {confirmRotate ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[15px] font-semibold text-sq-heading">Роздруковані QR стануть недійсними. Створити?</span>
                <button type="button" className="sq-btn-primary" disabled={saving} onClick={() => void rotate()}>
                  Так, створити нове
                </button>
                <button type="button" className="sq-btn-quiet" onClick={() => setConfirmRotate(false)}>
                  Скасувати
                </button>
              </div>
            ) : (
              <button type="button" className="sq-btn-quiet" disabled={saving} onClick={() => setConfirmRotate(true)}>
                Створити нове посилання
              </button>
            )}
          </div>
        )}

        <p role="status" className="min-h-5 text-[15px] text-sq-secondary">
          {message}
        </p>
      </div>
    </section>
  );
}
