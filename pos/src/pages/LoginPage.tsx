import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore, loadLastStoreSlug } from '../hooks/useAuth';
import { usePosShell } from '../shell';
import { OfflineAuthError } from '../offline/errors';

function loginErrorMessage(error: unknown): string {
  if (error instanceof OfflineAuthError) return error.message;
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Немає звʼязку з API. Перевірте, що бекенд запущено.';
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
  const afterLogin = shell === 'cashier' ? '/register' : '/admin';

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

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-sq-bg font-sans">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-8 text-center">
          <p className="sq-section-label">Cloth POS</p>
          <h1 className="text-3xl font-bold text-sq-text mt-2">Вхід</h1>
          <p className="text-sq-secondary mt-2 text-sm">
            {shell === 'cashier' ? 'Каса' : 'Каса та кабінет власника'}
          </p>
        </div>

        <div className="flex border-b border-sq-divider mb-6">
          <button
            type="button"
            onClick={() => setMode('pin')}
            className={`flex-1 min-h-11 py-3 text-sm font-medium border-b-2 -mb-px ${
              mode === 'pin' ? 'text-sq-blue border-sq-blue' : 'text-sq-secondary border-transparent'
            }`}
          >
            Продавець (PIN)
          </button>
          <button
            type="button"
            onClick={() => setMode('owner')}
            className={`flex-1 min-h-11 py-3 text-sm font-medium border-b-2 -mb-px ${
              mode === 'owner' ? 'text-sq-blue border-sq-blue' : 'text-sq-secondary border-transparent'
            }`}
          >
            Власник
          </button>
        </div>

        <form onSubmit={onSubmit} className="bg-white border border-sq-divider rounded-sq p-6 space-y-4">
          {mode === 'pin' ? (
            <>
              <label className="block text-sm">
                <span className="text-sq-secondary">Код магазину</span>
                <input
                  className="pos-field mt-1.5"
                  value={storeSlug}
                  onChange={(e) => setStoreSlug(e.target.value)}
                  autoComplete="organization"
                />
              </label>
              <label className="block text-sm">
                <span className="text-sq-secondary">PIN</span>
                <input
                  className="pos-field mt-1.5 tracking-[0.35em] text-center text-2xl"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoFocus
                />
              </label>
            </>
          ) : (
            <>
              <label className="block text-sm">
                <span className="text-sq-secondary">Email / логін</span>
                <input
                  className="pos-field mt-1.5"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
                />
              </label>
              <label className="block text-sm">
                <span className="text-sq-secondary">Пароль</span>
                <input
                  type="password"
                  className="pos-field mt-1.5"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
            </>
          )}

          {error && <div className="rounded-sq bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}

          <button type="submit" disabled={loading} className="pos-btn-primary w-full py-3.5">
            {loading ? 'Вхід…' : 'Увійти'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-sq-muted">
          Демо: магазин <span className="font-medium">demo</span>, PIN{' '}
          <span className="font-medium">1234</span> · власник{' '}
          <span className="font-medium">owner@demo.shop</span> /{' '}
          <span className="font-medium">owner123</span>
        </p>
      </div>
    </div>
  );
}
