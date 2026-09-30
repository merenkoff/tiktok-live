// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/pages/admin/StoreProfileCard.tsx
//
// The owner's «Про заклад» for the guest's QR menu: a logo, an address, a phone
// and the opening hours — the lines under the store's name on the page a guest
// opens from the QR. TechDocs/POS_QR_MENU.md, phase Q3a.
//
// Its own card with its own endpoint and its own «Зберегти», for the reason
// `PublicMenuCard` gives (and, unlike the main settings form, with room for a
// seven-day editor and a logo). It lives in the HOST and reaches the server
// through `api.posRequest`, so the `@pos/platform` surface — and the version
// every frozen desktop till checks a module against — does not move for it.
//
// Every field is optional and a card that is never opened changes nothing: an
// empty address and phone are saved as «none», and a week with no working day
// as «no hours» — which the guest's page shows as nothing at all, never as
// «зачинено». A seller gets 403 and sees nothing; a store whose vertical has no
// kitchen (no menu to put it on) sees nothing either.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, assetUrl } from '@pos/platform';
import { ImagePlus, Trash2 } from '../../platform/glyphs';
import { SectionHead } from '../../components/ui/Page';

type DayKey = '1' | '2' | '3' | '4' | '5' | '6' | '7';
type WeekHours = Partial<Record<DayKey, { open: string; close: string }>>;

interface StoreProfile {
  /** This kind of store can publish a menu at all. */
  available: boolean;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  hours: WeekHours | null;
}

interface DayDraft {
  on: boolean;
  from: string;
  to: string;
}

type LoadState = 'loading' | 'ready' | 'hidden' | 'error';

const DAYS: Array<[DayKey, string]> = [
  ['1', 'Понеділок'],
  ['2', 'Вівторок'],
  ['3', 'Середа'],
  ['4', 'Четвер'],
  ['5', 'П’ятниця'],
  ['6', 'Субота'],
  ['7', 'Неділя'],
];

const DEFAULT_FROM = '09:00';
const DEFAULT_TO = '18:00';
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The server's own limit; checked here too so a phone photo is turned back before it is sent, not after. */
const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const CHECKBOX = 'w-5 h-5 shrink-0 accent-[rgb(var(--sq-blue-rgb))]';

type Week = Record<DayKey, DayDraft>;

function toDraft(hours: WeekHours | null): Week {
  const week = {} as Week;
  for (const [key] of DAYS) {
    const day = hours?.[key];
    week[key] = day ? { on: true, from: day.open, to: day.close } : { on: false, from: DEFAULT_FROM, to: DEFAULT_TO };
  }
  return week;
}

/** The week the server takes: only the working days; none at all is `null` — «no hours», not «closed all week». */
function toHours(week: Week): WeekHours | null {
  const hours: WeekHours = {};
  for (const [key] of DAYS) {
    const day = week[key];
    if (day.on) hours[key] = { open: day.from, close: day.to };
  }
  return Object.keys(hours).length > 0 ? hours : null;
}

/** What is wrong with a draft week, in the owner's words — or null. The server checks the same, this only saves the round trip. */
function weekProblem(week: Week): string | null {
  for (const [key, name] of DAYS) {
    const day = week[key];
    if (!day.on) continue;
    if (!TIME_RE.test(day.from) || !TIME_RE.test(day.to)) return `${name}: вкажіть, з котрої і до котрої години.`;
    if (day.from === day.to) return `${name}: «з» і «до» однакові. Для цілодобової роботи вкажіть 00:00–23:59.`;
  }
  return null;
}

function errorText(error: unknown): string {
  const res = (error as { response?: { status?: number; data?: { error?: string } } }).response;
  if (res?.status === 403) return 'Лише власник магазину може змінювати це.';
  return res?.data?.error || 'Не вдалося зберегти. Спробуйте ще раз.';
}

export function StoreProfileCard() {
  const [state, setState] = useState<LoadState>('loading');
  const [saved, setSaved] = useState<StoreProfile | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [week, setWeek] = useState<Week>(() => toDraft(null));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const hydrate = useCallback((view: StoreProfile) => {
    setSaved(view);
    setLogo(view.logo_url);
    setAddress(view.address ?? '');
    setPhone(view.phone ?? '');
    setWeek(toDraft(view.hours));
  }, []);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const view = await api.posRequest<StoreProfile>('get', '/store/profile');
      hydrate(view);
      setState(view.available ? 'ready' : 'hidden');
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      // Owner-only, and a backend older than this card has no such route: a
      // seller or an old server simply does not see the card.
      setState(status === 403 || status === 404 ? 'hidden' : 'error');
    }
  }, [hydrate]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    if (!LOGO_TYPES.includes(file.type)) {
      setMessage('Логотип: JPEG, PNG, WebP або GIF.');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setMessage('Логотип більший за 5 МБ. Стисніть картинку й спробуйте ще раз.');
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const { url } = await api.posRequest<{ url: string; filename: string }>('post', '/store/logo', body, {
        timeout: 60000,
      });
      // Only stored so far: it becomes the logo when the owner saves the card.
      setLogo(url);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function setDay(key: DayKey, change: Partial<DayDraft>) {
    setWeek((current) => ({ ...current, [key]: { ...current[key], ...change } }));
  }

  /** «Так само в усі дні» — the first working day's hours, everywhere. */
  function copyToAll() {
    const source = DAYS.map(([key]) => week[key]).find((day) => day.on) ?? week['1'];
    setWeek((current) => {
      const next = { ...current };
      for (const [key] of DAYS) next[key] = { on: true, from: source.from, to: source.to };
      return next;
    });
  }

  async function save() {
    const problem = weekProblem(week);
    if (problem) {
      setMessage(problem);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const patch: Record<string, unknown> = {
        address: address.trim() || null,
        phone: phone.trim() || null,
        hours: toHours(week),
      };
      // The logo goes along only when it changed, so saving a phone number can
      // never re-send (or re-validate) a picture the owner did not touch.
      if (logo !== (saved?.logo_url ?? null)) patch.logo_url = logo;
      const view = await api.posRequest<StoreProfile>('patch', '/store/profile', patch);
      hydrate(view);
      setMessage('Збережено. Гість бачить зміни одразу.');
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  if (state === 'hidden' || state === 'loading') return null;

  if (state === 'error') {
    return (
      <section>
        <SectionHead title="Про заклад у меню" />
        <div className="pt-3 space-y-3">
          <p className="text-[15px] text-sq-secondary">Не вдалося завантажити дані закладу.</p>
          <button type="button" className="sq-btn-quiet" onClick={() => void load()}>
            Спробувати ще раз
          </button>
        </div>
      </section>
    );
  }

  const busy = saving || uploading;

  return (
    <section>
      <SectionHead title="Про заклад у меню" />
      <div className="pt-3 space-y-5">
        <p className="text-[15px] leading-relaxed text-sq-secondary">
          Логотип, адреса, телефон і години роботи стоять під назвою на сторінці, яку гість відкриває за QR. Усе
          необов’язкове: що не заповнено, того на сторінці немає.
        </p>

        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-sq-secondary">Логотип</p>
          <div className="flex flex-wrap items-start gap-3">
            <div className="w-16 h-16 rounded-[14px] bg-sq-sidebar ring-1 ring-inset ring-sq-divider overflow-hidden grid place-items-center shrink-0">
              {logo ? (
                <img src={assetUrl(logo) ?? undefined} alt="Логотип" className="w-full h-full object-contain" />
              ) : (
                <ImagePlus size={28} className="text-sq-muted" />
              )}
            </div>
            <div className="flex flex-col gap-2 min-w-0">
              <input
                ref={fileInput}
                data-testid="logo-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <button
                type="button"
                className="sq-btn-quiet w-fit"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? 'Завантаження…' : logo ? 'Змінити логотип' : 'Додати логотип'}
              </button>
              {logo && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setLogo(null)}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 w-fit"
                >
                  <Trash2 size={16} />
                  Прибрати
                </button>
              )}
              <p className="text-xs text-sq-muted">JPEG, PNG, WebP або GIF · до 5 МБ · краще квадратний</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-sq-secondary">Адреса</span>
            <input
              className="sq-input"
              value={address}
              maxLength={200}
              placeholder="м. Київ, вул. Прикладна, 1"
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-sq-secondary">Телефон</span>
            <input
              className="sq-input"
              type="tel"
              value={phone}
              maxLength={32}
              placeholder="+380 44 123 45 67"
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-[13px] font-semibold text-sq-secondary">Години роботи</legend>
          <div className="space-y-1">
            {DAYS.map(([key, name]) => {
              const day = week[key];
              return (
                <div key={key} className="min-h-11 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <label className="w-40 flex items-center gap-3 text-[15px] text-sq-text">
                    <input
                      type="checkbox"
                      className={CHECKBOX}
                      checked={day.on}
                      onChange={(e) => setDay(key, { on: e.target.checked })}
                    />
                    <span>{name}</span>
                  </label>
                  {day.on ? (
                    <span className="flex items-center gap-2 text-[15px] text-sq-secondary">
                      <input
                        className="sq-input w-36"
                        type="time"
                        aria-label={`${name}: з`}
                        value={day.from}
                        onChange={(e) => setDay(key, { from: e.target.value })}
                      />
                      –
                      <input
                        className="sq-input w-36"
                        type="time"
                        aria-label={`${name}: до`}
                        value={day.to}
                        onChange={(e) => setDay(key, { to: e.target.value })}
                      />
                    </span>
                  ) : (
                    <span className="text-[15px] text-sq-muted">зачинено</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="sq-btn-quiet" onClick={copyToAll}>
              Так само в усі дні
            </button>
            <p className="text-xs text-sq-muted">
              Закриваєтесь після півночі — вкажіть, наприклад, 18:00–02:00. Жодного дня не відмічено — годин на
              сторінці не буде.
            </p>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="sq-btn-primary" disabled={busy} onClick={() => void save()}>
            {saving ? 'Збереження…' : 'Зберегти'}
          </button>
          <p role="status" className="min-h-5 text-[15px] text-sq-secondary">
            {message}
          </p>
        </div>
      </div>
    </section>
  );
}
