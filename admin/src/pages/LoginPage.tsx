// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// admin/src/pages/LoginPage.tsx — retired 2026-09-09.
//
// This screen used to sign a seller in with nothing but their TikTok nickname:
// `POST /api/auth/login` asked for no password and no secret, and a nickname is
// public by definition — it is the handle the shop broadcasts under. Anyone who
// knew it got a 7-day token and could repoint the store's Telegram bot or stop
// its broadcast. That endpoint is gone (`src/users/users.controller.ts`), so
// there is nothing left to log in with.
//
// Everything this SPA did now lives inside the POS, where a real session exists:
// the broadcast desk at /live, and its settings at /admin/live, owner-only.
//
// The rest of the app (SessionPage, SettingsPage) is left in place rather than
// deleted — it is unreachable without a token, and keeping it makes the history
// legible if any of it is ever revived.

const POS_URL = 'https://pos.the-live.shop';

export function LoginPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        padding: '24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '460px', animation: 'fadeUp 0.4s ease both' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <span
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.03em',
            }}
          >
            LiveShop
          </span>
        </div>

        <div className="card" style={{ padding: '40px' }}>
          <h1
            style={{
              fontSize: '20px',
              fontWeight: 700,
              marginBottom: '12px',
              color: 'var(--text-primary)',
            }}
          >
            Ця панель більше не використовується
          </h1>

          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '14px',
              lineHeight: 1.7,
              marginBottom: '16px',
            }}
          >
            Керування прямим ефіром переїхало в POS. Там у вас є справжній вхід — з паролем
            власника або PIN-кодом продавця.
          </p>

          <ul
            style={{
              color: 'var(--text-secondary)',
              fontSize: '14px',
              lineHeight: 1.8,
              margin: '0 0 28px 18px',
              padding: 0,
            }}
          >
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>Ефір</strong> — розділ «Ефір» у касі
            </li>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>Налаштування ефіру</strong> — «Прямий
              ефір» в адмінці (доступно власнику)
            </li>
          </ul>

          <a
            href={POS_URL}
            className="btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '14px',
              display: 'flex',
              textDecoration: 'none',
            }}
          >
            Перейти до POS →
          </a>

          <p
            style={{
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '12px',
              marginTop: '20px',
            }}
          >
            Вхід за самим лише нікнеймом вимкнено з міркувань безпеки.
          </p>
        </div>
      </div>
    </div>
  );
}
