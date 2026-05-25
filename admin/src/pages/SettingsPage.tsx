// admin/src/pages/SettingsPage.tsx

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { UserSettings } from '../types';
import { Header } from '../components/Header';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function SettingsPage() {
  const [formData, setFormData] = useState<Partial<UserSettings>>({
    telegram_bot_token: '',
    telegram_channel_id: undefined,
    novaposhta_api_key: '',
    novaposhta_merchant_name: '',
    reservation_timeout_minutes: 5,
    payment_timeout_minutes: 10,
  });
  const [testResult, setTestResult] = useState<{ ok?: boolean; message?: string } | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<UserSettings>) => api.updateSettings(data),
    onSuccess: () => {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    },
  });

  const testMutation = useMutation({
    mutationFn: () => api.testTelegram(),
    onSuccess: (result) => {
      setTestResult(result);
      setTimeout(() => setTestResult(null), 5000);
    },
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        telegram_bot_token: settings.telegram_bot_token || '',
        telegram_channel_id: settings.telegram_channel_id,
        novaposhta_api_key: settings.novaposhta_api_key || '',
        novaposhta_merchant_name: settings.novaposhta_merchant_name || '',
        reservation_timeout_minutes: settings.reservation_timeout_minutes || 5,
        payment_timeout_minutes: settings.payment_timeout_minutes || 10,
      });
    }
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name.includes('timeout') || name.includes('channel_id') ? parseInt(value) : value,
    }));
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Header />

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: '800', letterSpacing: '-0.03em', marginBottom: '6px' }}>
            Налаштування
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Інтеграції та параметри сесії
          </p>
        </div>

        {/* Success toast */}
        {showSuccess && (
          <div style={{
            background: 'var(--green-dim)',
            border: '1px solid rgba(0,229,160,0.25)',
            color: 'var(--accent)',
            padding: '14px 20px',
            borderRadius: 'var(--radius-md)',
            fontSize: '14px',
            fontWeight: 600,
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            animation: 'fadeUp 0.3s ease',
          }}>
            <span>✓</span> Налаштування збережено
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* ── Telegram Section ── */}
          <SectionCard
            icon="🤖"
            title="Telegram Bot"
            subtitle="Підключіть бота для отримання замовлень"
          >
            <FieldGroup label="Bot Token" hint="Отримайте у @BotFather в Telegram">
              <input
                type="password"
                name="telegram_bot_token"
                value={formData.telegram_bot_token || ''}
                onChange={handleChange}
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              />
            </FieldGroup>

            <FieldGroup label="Channel ID" hint="Використайте @userinfobot щоб отримати ID">
              <input
                type="number"
                name="telegram_channel_id"
                value={formData.telegram_channel_id || ''}
                onChange={handleChange}
                placeholder="-1001234567890"
              />
            </FieldGroup>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button
                className="btn-ghost"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending || !formData.telegram_bot_token}
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
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: testResult.ok ? 'var(--green-dim)' : 'var(--red-dim)',
                  color: testResult.ok ? 'var(--green)' : 'var(--red)',
                  border: `1px solid ${testResult.ok ? 'rgba(0,229,160,0.2)' : 'rgba(240,77,77,0.2)'}`,
                }}>
                  {testResult.ok ? '✓' : '✗'} {testResult.message}
                </div>
              )}
            </div>
          </SectionCard>

          {/* ── Nova Poshta Section ── */}
          <SectionCard
            icon="📦"
            title="Нова Пошта"
            subtitle="Опціонально — для генерації ТТН та відстеження"
            badge="Опціонально"
          >
            <FieldGroup label="API Key" hint="developers.novaposhta.ua">
              <input
                type="password"
                name="novaposhta_api_key"
                value={formData.novaposhta_api_key || ''}
                onChange={handleChange}
                placeholder="Ваш API ключ Нової Пошти"
              />
            </FieldGroup>

            <FieldGroup label="Назва магазину" hint="Відображається у замовленнях">
              <input
                type="text"
                name="novaposhta_merchant_name"
                value={formData.novaposhta_merchant_name || ''}
                onChange={handleChange}
                placeholder="Назва вашого магазину"
              />
            </FieldGroup>
          </SectionCard>

          {/* ── Timeouts Section ── */}
          <SectionCard
            icon="⏱"
            title="Таймери бронювання"
            subtitle="Скільки часу є у покупця для кожного кроку"
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <FieldGroup
                label="Таймер броні"
                hint="Скільки часу товар утримується після коментаря"
              >
                <select
                  name="reservation_timeout_minutes"
                  value={formData.reservation_timeout_minutes || 5}
                  onChange={handleChange}
                >
                  {[3, 5, 10, 15, 30].map((v) => (
                    <option key={v} value={v}>{v} хвилин</option>
                  ))}
                </select>
              </FieldGroup>

              <FieldGroup
                label="Таймер оплати"
                hint="Час на підтвердження після оформлення замовлення"
              >
                <select
                  name="payment_timeout_minutes"
                  value={formData.payment_timeout_minutes || 10}
                  onChange={handleChange}
                >
                  {[5, 10, 20, 30].map((v) => (
                    <option key={v} value={v}>{v} хвилин</option>
                  ))}
                  <option value={60}>1 година</option>
                </select>
              </FieldGroup>
            </div>
          </SectionCard>
        </div>

        {/* ── Save Button ── */}
        <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn-primary"
            onClick={() => updateMutation.mutate(formData)}
            disabled={updateMutation.isPending}
            style={{ minWidth: '180px', justifyContent: 'center' }}
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
    <div className="card" style={{ padding: '28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px', flexShrink: 0,
          }}>
            {icon}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '2px' }}>{title}</div>
            {subtitle && <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{subtitle}</div>}
          </div>
        </div>
        {badge && (
          <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: '11px' }}>
            {badge}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {children}
      </div>
    </div>
  );
}

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: '13px', fontWeight: 600,
        color: 'var(--text-secondary)', marginBottom: '8px',
      }}>
        {label}
      </label>
      {children}
      {hint && (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
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
