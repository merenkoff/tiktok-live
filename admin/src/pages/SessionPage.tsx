// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// admin/src/pages/SessionPage.tsx (Enhanced)

import { useState, useEffect } from 'react';
import { useSession } from '../hooks/useSession';
import { useLogs } from '../hooks/useLogs';
import { Header } from '../components/Header';
import { SessionControl } from '../components/SessionControl';
import { LiveLogs } from '../components/LiveLogs';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function SessionPage() {
  const { session, isLoading, isError, isActive, start, stop, isStarting, isStopping } = useSession();
  const { logs, isConnected, reconnect } = useLogs();
  const [duration, setDuration] = useState('00:00:00');

  useEffect(() => {
    if (!isActive || !session?.started_at) return;
    const interval = setInterval(() => {
      const startTs = new Date(session.started_at!).getTime();
      const diff = Math.floor((Date.now() - startTs) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setDuration(
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive, session?.started_at]);

  const orderCount   = logs.filter((l) => l.log_type === 'order').length;
  const errorCount   = logs.filter((l) => l.log_type === 'error').length;
  const commentCount = logs.filter((l) => l.log_type === 'tiktok_comment').length;

  if (isLoading) return <LoadingSpinner />;

  if (isError) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="card" style={{ padding: '48px 40px', textAlign: 'center', maxWidth: '420px', animation: 'fadeUp 0.4s ease' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>
          Не вдалося підключитись до сервера
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '32px', lineHeight: 1.6 }}>
          Перевірте що бекенд запущений на порту 3000
        </p>
        <button className="btn-primary" onClick={() => window.location.reload()}>
          ↺ Спробувати знову
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Header />

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '36px 28px' }}>

        {/* ── Session Status Card ── */}
        <div className="card animate-fade-up" style={{ padding: '36px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '28px' }}>
            {/* Title & Status */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
                <span
                  className="status-dot"
                  style={isActive ? {
                    width: '12px', height: '12px', borderRadius: '50%',
                    background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)',
                    animation: 'pulse-dot 1.8s ease infinite', flexShrink: 0,
                  } : {
                    width: '12px', height: '12px', borderRadius: '50%',
                    background: 'var(--text-muted)', flexShrink: 0,
                  }}
                />
                <h1 style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-0.02em', margin: 0 }}>
                  Live Session
                </h1>
                <span className={`badge ${isActive ? 'badge-green' : ''}`} style={
                  !isActive ? { background: 'var(--bg-elevated)', color: 'var(--text-muted)' } : {}
                }>
                  {isActive ? '● Активна' : '● Зупинена'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>
                <span>WebSocket:</span>
                <span style={{ color: isConnected ? 'var(--accent)' : 'var(--red)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block', background: isConnected ? 'var(--accent)' : 'var(--red)' }} />
                  {isConnected ? 'підключено' : 'відключено'}
                </span>
              </div>
            </div>

            {/* Timer */}
            {isActive && (
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 28px',
                textAlign: 'center',
                minWidth: '180px',
              }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Тривалість
                </div>
                <div className="font-mono" style={{ fontSize: '32px', fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.06em' }}>
                  {duration}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: '32px', paddingTop: '32px', borderTop: '1px solid var(--border-subtle)' }}>
            <SessionControl
              isActive={isActive}
              onStart={start}
              onStop={stop}
              isStarting={isStarting}
              isStopping={isStopping}
            />
          </div>
        </div>

        {/* ── Main Grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: '32px' }}>

          {/* Left: Stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <span className="section-label">Статистика ефіру</span>

            <StatCard
              label="Замовлень"
              value={orderCount}
              color="var(--accent)"
              dimColor="var(--green-dim)"
              icon="🛍"
            />
            <StatCard
              label="Коментарів"
              value={commentCount}
              color="var(--blue)"
              dimColor="var(--blue-dim)"
              icon="💬"
            />
            <StatCard
              label="Помилок"
              value={errorCount}
              color={errorCount > 0 ? 'var(--red)' : 'var(--text-muted)'}
              dimColor={errorCount > 0 ? 'var(--red-dim)' : 'transparent'}
              icon="⚠"
            />

            {/* Tips card */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(0,229,160,0.08), rgba(0,229,160,0.04))',
              border: '1px solid rgba(0,229,160,0.2)',
              borderRadius: 'var(--radius-lg)',
              padding: '22px',
              marginTop: '8px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '14px' }}>
                💡 Підказки
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  'Запустіть сесію до початку ефіру',
                  'Замовлення — зелений рядок',
                  'Помилки виділені червоним',
                  'Коментарі — фіолетові рядки',
                ].map((tip, i) => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '8px', lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--accent)', flexShrink: 0, fontWeight: 600 }}>✓</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right: Live Logs */}
          <div>
            <span className="section-label">Лайв-лог</span>
            <LiveLogs logs={logs} isConnected={isConnected} onReconnect={reconnect} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Stat Card Component ── */
function StatCard({
  label, value, color, dimColor, icon,
}: {
  label: string; value: number; color: string; dimColor: string; icon: string;
}) {
  return (
    <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: 'var(--radius-md)',
        background: dimColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '22px',
        flexShrink: 0,
        border: `1px solid ${dimColor === 'transparent' ? 'var(--border-subtle)' : 'transparent'}`,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
          {label}
        </div>
        <div className="font-mono" style={{ fontSize: '28px', fontWeight: 700, color, lineHeight: 1, letterSpacing: '-0.01em' }}>
          {value}
        </div>
      </div>
    </div>
  );
}
