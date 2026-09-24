// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's ADMIN surface — what `/admin/live` renders, while `/live` keeps
// rendering the broadcast desk.
//
// Two surfaces, two components, one module: `RouteDef.mount` already carries
// the chrome, the audience and the shell, so the admin mount is owner-only by
// construction (`renderRoutes.tsx` wraps `/admin` in `<Guard ownerOnly>`) and
// never exists in the cashier shell. Note what this is NOT: a single component
// branching on `usePosShell()`. It could not work — on the web both `/live` and
// `/admin/live` report `'web'`.
//
// Do NOT reach for `ownerOnly: true` on the manifest to express this: that flag
// is module-scoped and would take the till's broadcast screen away from every
// seller.
//
// The TikTok nickname is deliberately read-only here and edited in the host's
// Settings page. It is the one setting without which this module does not load
// at all, so its only editor must live in code the shell always ships —
// otherwise a module that failed to download could not be repaired.

import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLiveSettings } from '../hooks/useLiveSettings';
import { useLiveSession } from '../hooks/useLiveSession';
import { SupportCode } from '../components/SupportCode';
import type { LiveSettingsPatch } from '../types';
import { AlertTriangle, Download, PageHeader, SectionHead, Video, type Glyph } from '@pos/platform/ui';

const RESERVATION_CHOICES = [3, 5, 10, 15, 30];

export function LiveSettingsPage() {
  const {
    status,
    settings,
    diagnostic,
    reload,
    save,
    saving,
    saveError,
    saved,
    clearSaved,
    testTelegram,
    testing,
    testResult,
  } = useLiveSettings();

  // A running broadcast holds a snapshot of these values taken at start, so an
  // edit made now changes nothing until stop/start. Only this module knows
  // whether a session is live, which is a large part of why the settings belong
  // beside the desk rather than in the host's Settings page.
  const { isActive } = useLiveSession(status === 'ready');

  // Secrets are write-only: blank means "keep what is stored", clearing is an
  // explicit act. The server never sends them back.
  const [botToken, setBotToken] = useState('');
  const [clearBotToken, setClearBotToken] = useState(false);
  const [npKey, setNpKey] = useState('');
  const [clearNpKey, setClearNpKey] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [reservationMinutes, setReservationMinutes] = useState(5);

  useEffect(() => {
    if (!settings) return;
    setChannelId(settings.telegram_channel_id ?? '');
    setMerchantName(settings.novaposhta_merchant_name ?? '');
    setReservationMinutes(settings.reservation_timeout_minutes || 5);
    setBotToken('');
    setNpKey('');
    setClearBotToken(false);
    setClearNpKey(false);
  }, [settings]);

  if (status === 'loading') {
    return <CenteredCard title="Завантаження налаштувань…" />;
  }

  if (status === 'host-too-old') {
    return (
      <CenteredCard
        icon={Download}
        title="Застосунок каси застарів для цього екрана"
        body="Екран ефіру працює, а його налаштування зʼявляться після оновлення застосунку. Поки що змінюйте їх у старій адмінці."
        diagnostic={diagnostic}
      />
    );
  }

  if (status === 'not-configured') {
    return (
      <CenteredCard
        icon={Video}
        title="Магазин не підʼєднано до TikTok LIVE"
        body="Вкажіть нікнейм TikTok-акаунта в Налаштуваннях магазину — після цього тут зʼявляться налаштування ефіру."
        link={{ to: '/admin/settings', label: 'Перейти до Налаштувань' }}
      />
    );
  }

  if (status === 'error' || !settings) {
    return (
      <CenteredCard
        icon={AlertTriangle}
        title="Не вдалося завантажити налаштування"
        body="Спробуйте ще раз. Якщо помилка повторюється — передайте код нижче в підтримку."
        action={{ label: 'Спробувати ще раз', onClick: reload }}
        diagnostic={diagnostic}
      />
    );
  }

  const botTokenStored = settings.telegram_bot_token_set && !clearBotToken;
  const npKeyStored = settings.novaposhta_api_key_set && !clearNpKey;

  function buildPatch(): LiveSettingsPatch {
    const patch: LiveSettingsPatch = {
      telegram_channel_id: channelId.trim() || null,
      novaposhta_merchant_name: merchantName.trim() || null,
      reservation_timeout_minutes: reservationMinutes,
    };
    if (clearBotToken) patch.telegram_bot_token = null;
    else if (botToken.trim()) patch.telegram_bot_token = botToken.trim();
    if (clearNpKey) patch.novaposhta_api_key = null;
    else if (npKey.trim()) patch.novaposhta_api_key = npKey.trim();
    return patch;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void save(buildPatch());
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-2xl space-y-7 pb-10 text-sq-text animate-fade-up">
      <PageHeader
        glyph={Video}
        title="Прямий ефір"
        subtitle="Інтеграції та таймер бронювання для трансляцій."
        actions={
          <Link to="/live" className="sq-btn-quiet">
            Відкрити екран ефіру
          </Link>
        }
      />

      {saved && (
        <div
          role="status"
          className="rounded-xl bg-sq-success/10 px-4 py-3 text-[15px] font-medium text-sq-success-ink"
        >
          Збережено
          {isActive && ' — зміни застосуються після перезапуску ефіру.'}
        </div>
      )}

      {saveError && (
        <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700">
          {saveError}
        </div>
      )}

      {/* ── Account ── */}
      <section>
        <SectionHead title="Акаунт" />
        <div className="pt-2 space-y-3">
          <div>
            <p className="text-base font-semibold text-sq-text">
              {settings.tiktok_username ? `@${settings.tiktok_username}` : '—'}
            </p>
            <p className="mt-0.5 text-[13px] text-sq-muted">
              Нікнейм змінюється в{' '}
              <Link to="/admin/settings" className="font-semibold text-sq-blue">
                Налаштуваннях магазину
              </Link>
              .
            </p>
          </div>
          {isActive && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
              Зараз іде ефір. Він працює зі знімком налаштувань, зробленим на старті — щоб зміни
              подіяли, зупиніть і запустіть ефір знову.
            </p>
          )}
        </div>
      </section>

      {/* ── Telegram ── */}
      <section>
        <SectionHead title="Telegram" />
        <div className="pt-2 space-y-4">
          <p className="text-[13px] text-sq-muted">Бот, який приймає замовлення з коментарів ефіру.</p>

          <SecretField
            label="Токен бота"
            name="telegram_bot_token"
            value={botToken}
            stored={botTokenStored}
            clearing={clearBotToken}
            hint="Отримайте у @BotFather."
            placeholder="123456:ABC-DEF1234ghIkl"
            onChange={(v) => {
              setBotToken(v);
              setClearBotToken(false);
              clearSaved();
            }}
            onClear={() => {
              setClearBotToken(true);
              setBotToken('');
            }}
            onCancelClear={() => setClearBotToken(false)}
          />

          <Field label="ID каналу" hint="Через @userinfobot. Порожнє поле — прибрати.">
            <input
              name="telegram_channel_id"
              type="text"
              inputMode="numeric"
              className="sq-input tabular-nums"
              placeholder="-1001234567890"
              value={channelId}
              onChange={(e) => {
                setChannelId(e.target.value);
                clearSaved();
              }}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void testTelegram()}
              disabled={testing || !botTokenStored}
              className="sq-btn-quiet"
            >
              {testing ? 'Перевірка…' : 'Перевірити зʼєднання'}
            </button>
            {testResult && (
              <span
                role="status"
                className={`text-sm ${testResult.ok ? 'text-sq-success-ink' : 'text-red-600'}`}
              >
                {testResult.ok
                  ? `Бот працює${testResult.username ? ` — @${testResult.username}` : ''}`
                  : testResult.error}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── Nova Poshta ── */}
      <section>
        <SectionHead title="Нова Пошта" />
        <div className="pt-2 space-y-4">
          <p className="text-[13px] text-sq-muted">Необовʼязково — для ТТН та відстеження посилок.</p>

          <SecretField
            label="API-ключ"
            name="novaposhta_api_key"
            value={npKey}
            stored={npKeyStored}
            clearing={clearNpKey}
            hint="developers.novaposhta.ua"
            placeholder="Ваш API-ключ"
            onChange={(v) => {
              setNpKey(v);
              setClearNpKey(false);
              clearSaved();
            }}
            onClear={() => {
              setClearNpKey(true);
              setNpKey('');
            }}
            onCancelClear={() => setClearNpKey(false)}
          />

          <Field label="Назва відправника" hint="Показується в замовленнях і ТТН.">
            <input
              name="novaposhta_merchant_name"
              type="text"
              className="sq-input"
              placeholder="Назва вашого магазину"
              value={merchantName}
              onChange={(e) => {
                setMerchantName(e.target.value);
                clearSaved();
              }}
            />
          </Field>
        </div>
      </section>

      {/* ── Reservation timer ── */}
      <section>
        <SectionHead title="Бронювання" />
        <div className="pt-2 space-y-4">
          <p className="text-[13px] text-sq-muted">
            Скільки часу товар утримується за глядачем після коментаря.
          </p>
          <Field label="Таймер броні">
            <select
              name="reservation_timeout_minutes"
              className="sq-input"
              value={reservationMinutes}
              onChange={(e) => {
                setReservationMinutes(parseInt(e.target.value, 10));
                clearSaved();
              }}
            >
              {RESERVATION_CHOICES.map((v) => (
                <option key={v} value={v}>
                  {v} хвилин
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <div className="flex">
        <button
          type="submit"
          disabled={saving}
          className="pos-btn-primary min-h-11 px-5 rounded-sq text-[15px]"
        >
          {saving ? 'Збереження…' : 'Зберегти'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-sq-secondary">{label}</span>
      {children}
      {hint && <span className="text-[13px] text-sq-muted">{hint}</span>}
    </label>
  );
}

/** A write-only credential: blank keeps the stored one, clearing is explicit. */
function SecretField({
  label,
  name,
  value,
  stored,
  clearing,
  hint,
  placeholder,
  onChange,
  onClear,
  onCancelClear,
}: {
  label: string;
  name: string;
  value: string;
  stored: boolean;
  clearing: boolean;
  hint: string;
  placeholder: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onCancelClear: () => void;
}) {
  return (
    <Field
      label={label}
      hint={stored ? 'Збережено. Введіть новий, щоб замінити — порожнє поле лишає поточний.' : hint}
    >
      <input
        name={name}
        type="password"
        autoComplete="off"
        className="sq-input"
        placeholder={stored ? '•••••••• збережено' : placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {clearing ? (
        <span className="text-[13px] text-red-600">
          Буде видалено при збереженні.{' '}
          <button type="button" className="font-semibold text-sq-blue" onClick={onCancelClear}>
            Скасувати
          </button>
        </span>
      ) : (
        stored && (
          <button
            type="button"
            className="self-start text-[13px] font-semibold text-red-600"
            onClick={onClear}
          >
            Видалити збережене значення
          </button>
        )
      )}
    </Field>
  );
}

function CenteredCard({
  icon,
  title,
  body,
  action,
  link,
  diagnostic,
}: {
  icon?: Glyph;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  link?: { to: string; label: string };
  diagnostic?: import('../lib/diagnostics').LiveDiagnostic | null;
}) {
  const Icon = icon;
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="sq-card animate-fade-up w-full max-w-md p-8 text-center">
        {Icon && (
          <div className="mb-4 flex justify-center">
            <Icon size={48} />
          </div>
        )}
        <h2 className="text-[19px] font-bold text-sq-heading">{title}</h2>
        {body && <p className="mt-2 text-[15px] leading-relaxed text-sq-secondary">{body}</p>}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="pos-btn-primary mt-6 min-h-11 px-5 rounded-sq text-[15px]"
          >
            {action.label}
          </button>
        )}
        {link && (
          <Link to={link.to} className="pos-btn-primary mt-6 min-h-11 px-5 rounded-sq text-[15px]">
            {link.label}
          </Link>
        )}
        {diagnostic && <SupportCode diagnostic={diagnostic} />}
      </div>
    </div>
  );
}
