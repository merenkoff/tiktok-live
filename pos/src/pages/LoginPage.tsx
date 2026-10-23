// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore, loadLastStoreSlug, usePosShell, OfflineAuthError } from '@pos/platform';
import { isIos, isStandalone, useInstallPrompt } from '../lib/installPrompt';
import { AppIcon } from '../components/AppIcon';

function loginErrorMessage(error: unknown, mode: 'owner' | 'pin'): string {
  if (error instanceof OfflineAuthError) return error.message;
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return 'Сервер не відповів вчасно. Перевірте інтернет і спробуйте ще раз.';
      }
      const code = error.code ? ` (${error.code})` : '';
      if (error.code && error.code.startsWith('ERR_CERT')) {
        // Stale root certs are the classic cause here, most often from a
        // system that's been offline a while — true on macOS/Linux kiosks
        // too, not just Windows, so the tip stays OS-neutral rather than
        // naming one platform on hardware that runs all three (roadmap #13,
        // pos-release.yml builds macOS/Windows/Linux installers alike).
        return `Помилка сертифіката${code}. Перевірте дату й час на компʼютері та оновлення системи.`;
      }
      return `Немає звʼязку з API${code}. Перевірте інтернет, дату/час і оновлення системи.`;
    }
    // The server's 401 is one English sentence for every wrong field, on
    // purpose (it must not say which one was wrong) — so is this one.
    if (error.response.status === 401) {
      return mode === 'owner'
        ? 'Невірний email, пароль або код магазину.'
        : 'Невірний PIN або код магазину.';
    }
    const apiError = error.response.data?.error;
    if (typeof apiError === 'string') return apiError;
  }
  return 'Не вдалося увійти. Перевірте дані.';
}

export function LoginPage() {
  const [mode, setMode] = useState<'owner' | 'pin'>('pin');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  // The code this device last signed in to: shown, but locked, so after the
  // first login only the email + password (or the PIN) is typed. «Змінити»
  // unlocks it; the next successful login remembers whatever was typed.
  const [storeSlug, setStoreSlug] = useState(loadLastStoreSlug);
  const [slugLocked, setSlugLocked] = useState(() => loadLastStoreSlug() !== '');
  const slugRef = useRef<HTMLInputElement>(null);
  const slugUnlocked = useRef(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loginOwner = useAuthStore((s) => s.loginOwner);
  const loginPin = useAuthStore((s) => s.loginPin);
  const navigate = useNavigate();
  const shell = usePosShell();
  const afterLogin = shell === 'web' ? '/admin' : '/register';
  const { canInstall, install } = useInstallPrompt();
  // The install nudge belongs to the tablet entry only, and only in a browser
  // tab: an installed app asking to be installed is noise.
  const installHint = shell === 'tablet' && !isStandalone();

  // Focus the code once «Змінити» has unlocked it — not on mount, where it
  // would take the focus from the PIN field.
  useEffect(() => {
    if (!slugLocked && slugUnlocked.current) slugRef.current?.focus();
  }, [slugLocked]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!storeSlug.trim()) {
      setError('Введіть код магазину');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'owner') {
        if (!login.trim()) {
          setError('Введіть email');
          return;
        }
        if (!password.trim()) {
          setError('Введіть пароль');
          return;
        }
        await loginOwner(login, password, storeSlug.trim());
        navigate(afterLogin);
      } else {
        if (!pin.trim()) {
          setError('Введіть PIN');
          return;
        }
        await loginPin(storeSlug.trim(), pin);
        navigate('/register');
      }
    } catch (err) {
      setError(loginErrorMessage(err, mode));
    } finally {
      setLoading(false);
    }
  }

  const storeCodeField = (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="login-store-code" className={labelClass}>
          Код магазину
        </label>
        {slugLocked && (
          <button
            type="button"
            onClick={() => {
              slugUnlocked.current = true;
              setSlugLocked(false);
            }}
            className="text-[13px] font-semibold text-sq-blue"
            data-testid="store-code-change"
          >
            Змінити
          </button>
        )}
      </div>
      <input
        id="login-store-code"
        ref={slugRef}
        className={`${fieldClass} disabled:text-sq-secondary disabled:cursor-default`}
        value={storeSlug}
        onChange={(e) => setStoreSlug(e.target.value)}
        disabled={slugLocked}
        autoComplete="organization"
        autoCapitalize="none"
        spellCheck={false}
      />
    </div>
  );

  const pinDots = Math.max(4, pin.length);
  const segClass = (on: boolean) =>
    `flex-1 min-h-[38px] rounded-[9px] text-[15px] transition-colors ${
      on ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text' : 'font-medium text-sq-secondary'
    }`;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-sq-bg">
      <div className="w-full max-w-[420px] flex flex-col items-center gap-[22px] animate-fade-up">
        <div className="drop-shadow-[0_10px_18px_rgba(0,30,80,.2)]">
          <AppIcon size={84} />
        </div>
        <div className="text-center">
          <h1 className="text-[30px] font-bold text-sq-heading leading-tight">Вхід</h1>
          <p className="text-[15px] text-sq-secondary mt-1">
            {shell === 'cashier'
              ? 'Каса'
              : shell === 'tablet'
                ? 'Планшет офіціанта'
                : 'Каса та кабінет власника'}
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="w-full bg-white rounded-card shadow-card p-5 flex flex-col gap-3.5"
        >
          <div className="flex gap-1 p-[3px] rounded-xl bg-sq-empty" role="group" aria-label="Хто входить">
            <button type="button" aria-pressed={mode === 'pin'} onClick={() => setMode('pin')} className={segClass(mode === 'pin')}>
              Продавець · PIN
            </button>
            <button type="button" aria-pressed={mode === 'owner'} onClick={() => setMode('owner')} className={segClass(mode === 'owner')}>
              Власник
            </button>
          </div>

          {storeCodeField}

          {mode === 'pin' ? (
            <>
              <label className="flex flex-col gap-2">
                <span className={labelClass}>PIN</span>
                <span className="relative flex justify-center gap-2.5 py-1.5" data-testid="pin-dots">
                  {Array.from({ length: pinDots }, (_, i) => (
                    <span
                      key={i}
                      aria-hidden
                      className={`w-4 h-4 rounded-full ${
                        i < pin.length ? 'bg-sq-heading' : 'ring-2 ring-inset ring-sq-divider'
                      }`}
                    />
                  ))}
                  {/* The real field sits over the dots: taps focus it, a
                      keyboard or a password manager types into it. */}
                  <input
                    className="absolute inset-0 w-full opacity-0 cursor-text"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </span>
              </label>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>Email / логін</span>
                <input
                  className={fieldClass}
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoFocus={slugLocked}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>Пароль</span>
                <input
                  type="password"
                  className={fieldClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
            </>
          )}

          {error && <div className="rounded-sq bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}

          <button type="submit" disabled={loading} className="pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]">
            {loading ? 'Вхід…' : 'Увійти'}
          </button>
        </form>

        {installHint && canInstall && (
          <button
            type="button"
            onClick={() => void install()}
            className="w-full min-h-12 rounded-xl bg-white ring-1 ring-sq-divider text-[15px] font-semibold text-sq-text"
            data-testid="install-app"
          >
            Встановити на планшет
          </button>
        )}
        {installHint && !canInstall && isIos() && (
          <p className="text-center text-[13px] text-sq-muted" data-testid="install-hint-ios">
            Щоб відкривати як застосунок: «Поділитися» → «На Початковий екран».
          </p>
        )}

        <p className="text-center text-[13px] text-sq-muted">
          Демо: магазин <span className="font-medium">demo</span>, PIN{' '}
          <span className="font-medium">1234</span> · власник{' '}
          <span className="font-medium">owner@demo.shop</span> /{' '}
          <span className="font-medium">owner123</span>
        </p>
      </div>
    </div>
  );
}

const labelClass = 'text-[13px] font-semibold text-sq-secondary';
const fieldClass =
  'h-12 rounded-xl bg-sq-empty px-3.5 text-[17px] text-sq-text outline-none border-0 focus:ring-2 focus:ring-sq-blue focus:bg-white transition-colors';
