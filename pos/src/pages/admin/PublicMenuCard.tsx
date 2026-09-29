// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/pages/admin/PublicMenuCard.tsx
//
// The owner's «QR-меню»: a switch, the address, and the QR card to print.
// TechDocs/POS_QR_MENU.md.
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
import { SectionHead } from '../../components/ui/Page';

interface PublicMenuSettings {
  /** This kind of store can publish a menu at all. */
  available: boolean;
  enabled: boolean;
  token: string | null;
  url: string | null;
}

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

  const rotate = () =>
    run(
      () => api.posRequest<PublicMenuSettings>('post', '/store/public-menu/rotate'),
      () => 'Створено нове посилання. Старі QR більше не працюють — роздрукуйте новий.'
    );

  async function copy() {
    if (!settings?.url) return;
    try {
      await navigator.clipboard.writeText(settings.url);
      setMessage('Посилання скопійовано.');
    } catch {
      // No clipboard permission (an insecure origin, an embedded webview):
      // select the text, so the owner's own Ctrl+C finishes the job.
      urlInput.current?.select();
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
              <a className="sq-btn-quiet" href={settings.url ?? undefined} target="_blank" rel="noopener noreferrer">
                Відкрити меню
              </a>
              <button type="button" className="sq-btn-quiet" onClick={() => void copy()}>
                Копіювати посилання
              </button>
            </div>
          </div>
        )}

        {settings.token && (
          <div className="rounded-xl bg-sq-sidebar px-[18px] py-4 space-y-3">
            <p className="text-[15px] text-sq-text">
              Потрапило посилання не тим людям? Створіть нове: старі QR перестануть працювати.
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
