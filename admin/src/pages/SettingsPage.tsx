// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// admin/src/pages/SettingsPage.tsx (Enhanced)

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { UserSettingsPatch } from '../types';
import { Header } from '../components/Header';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function SettingsPage() {
  // Secrets are write-only: the API never sends them back, only whether one is
  // stored. A blank field therefore means "keep what is saved", and clearing is
  // an explicit act. The previous version hydrated the masked value `'***'`
  // into these inputs and posted it on save, overwriting the real credential.
  const [botToken, setBotToken] = useState('');
  const [clearBotToken, setClearBotToken] = useState(false);
  const [npKey, setNpKey] = useState('');
  const [clearNpKey, setClearNpKey] = useState(false);

  const [channelId, setChannelId] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [reservationMinutes, setReservationMinutes] = useState(5);

  const [testResult, setTestResult] = useState<{ ok?: boolean; message?: string } | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });

  const updateMutation = useMutation({
    mutationFn: (data: UserSettingsPatch) => api.updateSettings(data),
    onSuccess: () => {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3500);
    },
  });

  const testMutation = useMutation({
    mutationFn: () => api.testTelegram(),
    onSuccess: (result) => {
      setTestResult(result);
      setTimeout(() => setTestResult(null), 5500);
    },
  });

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

  /** Omit to keep, `null` to clear, a value to set. */
  function buildPatch(): UserSettingsPatch {
    const patch: UserSettingsPatch = {
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

  const botTokenStored = Boolean(settings?.telegram_bot_token_set) && !clearBotToken;
  const npKeyStored = Boolean(settings?.novaposhta_api_key_set) && !clearNpKey;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Header />

      <div style={{ maxWidth: '840px', margin: '0 auto', padding: '36px 28px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '40px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.03em', marginBottom: '8px', color: 'var(--text-primary)' }}>
            Налаштування
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: 1.6 }}>
            Інтеграції та параметри сесії
          </p>
        </div>

        {/* Success toast */}
        {showSuccess && (
          <div style={{
            background: 'linear-gradient(90deg, var(--green-dim), rgba(0,229,160,0.08))',
            border: '1px solid rgba(0,229,160,0.3)',
            color: 'var(--accent)',
            padding: '14px 20px',
            borderRadius: 'var(--radius-md)',
            fontSize: '14px',
            fontWeight: 600,
            marginBottom: '28px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            animation: 'fadeUp 0.3s ease',
          }}>
            <span style={{ fontSize: '18px' }}>✓</span>
            <span>Налаштування збережено успішно</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* ── Telegram Section ── */}
          <SectionCard
            icon="🤖"
            title="Telegram Bot"
            subtitle="Підключіть бота для отримання замовлень та коментарів"
          >
            <FieldGroup
              label="Bot Token"
              hint={
                botTokenStored
                  ? 'Збережено. Введіть новий, щоб замінити — порожнє поле лишає поточний.'
                  : 'Отримайте у @BotFather в Telegram'
              }
            >
              <input
                type="password"
                name="telegram_bot_token"
                value={botToken}
                onChange={(e) => {
                  setBotToken(e.target.value);
                  setClearBotToken(false);
                }}
                placeholder={botTokenStored ? '•••••••• збережено' : '123456:ABC-DEF1234ghIkl'}
              />
              <SecretActions
                stored={botTokenStored}
                clearing={clearBotToken}
                onClear={() => {
                  setClearBotToken(true);
                  setBotToken('');
                }}
                onCancelClear={() => setClearBotToken(false)}
              />
            </FieldGroup>

            <FieldGroup label="Channel ID" hint="Використайте @userinfobot щоб отримати ID каналу. Порожнє поле — прибрати.">
              <input
                type="text"
                inputMode="numeric"
                name="telegram_channel_id"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                placeholder="-1001234567890"
              />
            </FieldGroup>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', paddingTop: '8px' }}>
              <button
                className="btn-ghost"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending || !(botTokenStored || botToken.trim())}
              >
                {testMutation.isPending ? (
                  <>
                    <Spinner /> Перевірка...
                  </>
                ) : (
                  '⚡ Перевірити з\'єднання'
                )}
              </button>

              {testResult && (
                <div style={{
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: testResult.ok ? 'var(--green-dim)' : 'var(--red-dim)',
                  color: testResult.ok ? 'var(--green)' : 'var(--red)',
                  border: `1px solid ${testResult.ok ? 'rgba(0,229,160,0.3)' : 'rgba(240,77,77,0.3)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  animation: 'fadeUp 0.2s ease',
                }}>
                  <span>{testResult.ok ? '✓' : '✗'}</span>
                  {testResult.message}
                </div>
              )}
            </div>
          </SectionCard>

          {/* ── Nova Poshta Section ── */}
          <SectionCard
            icon="📦"
            title="Нова Пошта"
            subtitle="Опціонально — для генерації ТТН та відстеження посилок"
            badge="Опціонально"
          >
            <FieldGroup
              label="API Key"
              hint={
                npKeyStored
                  ? 'Збережено. Введіть новий, щоб замінити — порожнє поле лишає поточний.'
                  : 'developers.novaposhta.ua'
              }
            >
              <input
                type="password"
                name="novaposhta_api_key"
                value={npKey}
                onChange={(e) => {
                  setNpKey(e.target.value);
                  setClearNpKey(false);
                }}
                placeholder={npKeyStored ? '•••••••• збережено' : 'Ваш API ключ Нової Пошти'}
              />
              <SecretActions
                stored={npKeyStored}
                clearing={clearNpKey}
                onClear={() => {
                  setClearNpKey(true);
                  setNpKey('');
                }}
                onCancelClear={() => setClearNpKey(false)}
              />
            </FieldGroup>

            <FieldGroup label="Назва магазину" hint="Відображається у замовленнях та ТТН">
              <input
                type="text"
                name="novaposhta_merchant_name"
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                placeholder="Назва вашого магазину"
              />
            </FieldGroup>
          </SectionCard>

          {/* ── Timers ── */}
          <SectionCard
            icon="⏱"
            title="Таймер бронювання"
            subtitle="Скільки часу товар утримується після коментаря"
          >
            <FieldGroup
              label="Таймер броні"
              hint="Застосується після наступного запуску ефіру — активна сесія працює зі знімком налаштувань, зробленим на старті."
            >
              <select
                name="reservation_timeout_minutes"
                value={reservationMinutes}
                onChange={(e) => setReservationMinutes(parseInt(e.target.value, 10))}
              >
                {[3, 5, 10, 15, 30].map((v) => (
                  <option key={v} value={v}>{v} хвилин</option>
                ))}
              </select>
            </FieldGroup>
          </SectionCard>
        </div>

        {/* ── Save Button ── */}
        <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn-primary"
            onClick={() => updateMutation.mutate(buildPatch())}
            disabled={updateMutation.isPending}
            style={{ minWidth: '200px', justifyContent: 'center', fontSize: '15px', padding: '13px 28px' }}
          >
            {updateMutation.isPending ? (
              <><Spinner dark /> Збереження...</>
            ) : (
              '💾 Зберегти зміни'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ── */
function SectionCard({
  icon, title, subtitle, badge, children,
}: {
  icon: string; title: string; subtitle?: string; badge?: string; children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1 }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', flexShrink: 0,
            border: '1px solid var(--border-subtle)',
          }}>
            {icon}
          </div>
          <div>
            <h3 style={{ fontWeight: 700, fontSize: '17px', marginBottom: '4px', color: 'var(--text-primary)' }}>{title}</h3>
            {subtitle && <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{subtitle}</p>}
          </div>
        </div>
        {badge && (
          <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: '11px', marginLeft: '16px', flexShrink: 0 }}>
            {badge}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
        {children}
      </div>
    </div>
  );
}

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: '13px', fontWeight: 700,
        color: 'var(--text-primary)', marginBottom: '10px',
        letterSpacing: '-0.01em',
      }}>
        {label}
      </label>
      {children}
      {hint && (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '7px', lineHeight: 1.4 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Spinner({ dark }: { dark?: boolean }) {
  return (
    <span style={{
      width: '14px', height: '14px',
      border: `2px solid ${dark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.15)'}`,
      borderTopColor: dark ? '#000' : 'var(--text-primary)',
      borderRadius: '50%',
      animation: 'spin-slow 0.7s linear infinite',
      display: 'inline-block',
      flexShrink: 0,
    }} />
  );
}

/** Explicit clear for a write-only secret, plus a way to change your mind. */
function SecretActions({
  stored,
  clearing,
  onClear,
  onCancelClear,
}: {
  stored: boolean;
  clearing: boolean;
  onClear: () => void;
  onCancelClear: () => void;
}) {
  if (clearing) {
    return (
      <p style={{ fontSize: '12px', color: 'var(--red)', marginTop: '7px' }}>
        Буде видалено при збереженні.{' '}
        <button type="button" className="btn-ghost" style={{ padding: '2px 6px' }} onClick={onCancelClear}>
          Скасувати
        </button>
      </p>
    );
  }
  if (!stored) return null;
  return (
    <button
      type="button"
      className="btn-ghost"
      style={{ padding: '4px 8px', marginTop: '7px', fontSize: '12px' }}
      onClick={onClear}
    >
      Видалити збережене значення
    </button>
  );
}
