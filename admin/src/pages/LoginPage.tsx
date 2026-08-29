// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// admin/src/pages/LoginPage.tsx

import { useState } from 'react';
import { useAuthStore } from '../hooks/useAuth';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const login = useAuthStore((state) => state.login);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(username.trim());
      // Soft transition: App remounts BrowserRouter when isAuthenticated becomes true
    } catch (err: any) {
      const message =
        err?.response?.data?.error ||
        err?.message ||
        'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient glow behind card */}
      <div style={{
        position: 'absolute',
        width: '600px',
        height: '600px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,229,160,0.06) 0%, transparent 70%)',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%',
        maxWidth: '420px',
        position: 'relative',
        animation: 'fadeUp 0.4s ease both',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '12px',
          }}>
            <span style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: 'var(--accent)',
              boxShadow: '0 0 10px var(--accent-glow)',
              animation: 'pulse-dot 1.8s ease infinite',
              display: 'inline-block',
            }} />
            <span style={{
              fontSize: '22px',
              fontWeight: '800',
              color: 'var(--text-primary)',
              letterSpacing: '-0.03em',
            }}>
              LiveShop
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Панель адміністратора
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: '40px' }}>
          <h1 style={{
            fontSize: '20px',
            fontWeight: '700',
            marginBottom: '8px',
            color: 'var(--text-primary)',
          }}>
            Вхід у систему
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '32px' }}>
            Введіть ваш TikTok нікнейм, щоб увійти
          </p>

          {error && (
            <div style={{
              background: 'var(--red-dim)',
              border: '1px solid rgba(240,77,77,0.25)',
              color: 'var(--red)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              fontSize: '14px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span>⚠</span>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} data-testid="login-form">
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '600',
                color: 'var(--text-secondary)',
                marginBottom: '8px',
                letterSpacing: '0.02em',
              }}>
                TikTok username
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute',
                  left: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  fontSize: '15px',
                  userSelect: 'none',
                }}>@</span>
                <input
                  type="text"
                  placeholder="evelin_kids"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={loading}
                  data-testid="login-username"
                  style={{ paddingLeft: '36px' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !username.trim()}
              className="btn-primary"
              data-testid="login-submit"
              style={{ width: '100%', justifyContent: 'center', padding: '14px' }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(0,0,0,0.3)',
                    borderTopColor: '#000',
                    borderRadius: '50%',
                    animation: 'spin-slow 0.7s linear infinite',
                    display: 'inline-block',
                  }} />
                  Входжу...
                </>
              ) : (
                'Увійти →'
              )}
            </button>
          </form>

          <p style={{
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '12px',
            marginTop: '20px',
          }}>
            Пароль не потрібен — лише нікнейм
          </p>
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '12px',
          marginTop: '24px',
        }}>
          LiveShop · Автоматизація TikTok LIVE · 2026
        </p>
      </div>
    </div>
  );
}
