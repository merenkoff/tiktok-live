// admin/src/pages/SessionPage.tsx

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
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ padding: '40px', textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>⚠️</div>
        <div style={{ fontWeight: 700, marginBottom: '8px' }}>Не вдалося підключитись до сервера</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
          Перевірте що бекенд запущений на порту 3000
        </div>
        <button className="btn-ghost" onClick={() => window.location.reload()}>
          ↺ Спробувати знову
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Header />

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Session Status Card ── */}
        <div className="card animate-fade-up" style={{ padding: '32px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '24px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <span
                  className="status-dot"
                  style={isActive ? {
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)',
                    animation: 'pulse-dot 1.8s ease infinite', flexShrink: 0,
                  } : {
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: 'var(--text-muted)', flexShrink: 0,
                  }}
                />
                <h1 style={{ fontSize: '22px', fontWeight: '800', letterSpacing: '-0.02em' }}>
                  Live Session
                </h1>
                <span className={`badge ${isActive ? 'badge-green' : ''}`} style={
                  !isActive ? { background: 'var(--bg-elevated)', color: 'var(--text-muted)' } : {}
                }>
                  {isActive ? 'Активна' : 'Зупинена'}
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                WebSocket:{' '}
                <span style={{ color: isConnected ? 'var(--accent)' : 'var(--red)', fontWeight: 600 }}>
                  {isConnected ? '● підключено' : '● відключено'}
                </span>
              </p>
            </div>

            {/* Timer */}
            {isActive && (
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 24px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Тривалість
                </div>
                <div className="font-mono" style={{ fontSize: '28px', fontWeight: 500, color: 'var(--accent)', letterSpacing: '0.04em' }}>
                  {duration}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: '28px', paddingTop: '28px', borderTop: '1px solid var(--border-subtle)' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px' }}>

          {/* Left: Stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="section-label">Статистика ефіру</div>

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
              background: 'var(--accent-dim)',
              border: '1px solid rgba(0,229,160,0.18)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
              marginTop: '4px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
                Підказки
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  'Запустіть сесію до початку ефіру',
                  'Замовлення — зелений рядок у лозі',
                  'Помилки виділені червоним',
                  'Коментарі — фіолетові рядки',
                ].map((tip, i) => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '8px' }}>
                    <span style={{ color: 'var(--accent)', flexShrink: 0 }}>✓</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right: Live Logs */}
          <div>
            <div className="section-label">Лайв-лог</div>
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
    <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{
        width: '44px',
        height: '44px',
        borderRadius: 'var(--radius-md)',
        background: dimColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
          {label}
        </div>
        <div className="font-mono" style={{ fontSize: '26px', fontWeight: 600, color, lineHeight: 1 }}>
          {value}
        </div>
      </div>
    </div>
  );
}
