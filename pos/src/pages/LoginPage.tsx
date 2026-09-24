// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore, loadLastStoreSlug, usePosShell, OfflineAuthError } from '@pos/platform';
import { isIos, isStandalone, useInstallPrompt } from '../lib/installPrompt';
import { AppIcon } from '../components/AppIcon';

function loginErrorMessage(error: unknown): string {
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
    const apiError = error.response.data?.error;
    if (typeof apiError === 'string') return apiError;
    if (error.response.status === 401) return 'Невірний логін, пароль або PIN.';
  }
  return 'Не вдалося увійти. Перевірте дані.';
}

export function LoginPage() {
  const [mode, setMode] = useState<'owner' | 'pin'>('pin');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [storeSlug, setStoreSlug] = useState(loadLastStoreSlug());
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'owner') {
        if (!password.trim()) {
          setError('Введіть пароль');
          return;
        }
        await loginOwner(login, password);
        navigate(afterLogin);
      } else {
        if (!pin.trim()) {
          setError('Введіть PIN');
          return;
        }
        await loginPin(storeSlug, pin);
        navigate('/register');
      }
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

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

          {mode === 'pin' ? (
            <>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>Код магазину</span>
                <input
                  className={fieldClass}
                  value={storeSlug}
                  onChange={(e) => setStoreSlug(e.target.value)}
                  autoComplete="organization"
                  autoCapitalize="none"
                />
              </label>
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
