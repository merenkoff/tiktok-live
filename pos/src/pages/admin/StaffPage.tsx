// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useState } from 'react';
import axios from 'axios';
import { api, useAuthStore } from '@pos/platform';
import type { PosRole, StaffMember } from '../../types';
import { PageHeader } from '../../components/ui/Page';
import { Plus, User } from '../../platform/glyphs';
import { PinLockNotice } from './PinLockNotice';

/** A role the owner gives on this page — never a second owner. */
type StaffRole = Exclude<PosRole, 'owner'>;

const ROLE_WORDS: Record<PosRole, string> = {
  owner: 'власник',
  seller: 'продавець',
  marketer: 'маркетолог',
};

/** A marketer's PIN opens the cabinet, so it is six digits (track МР, М2); a seller's four to six. */
function pinHint(role: StaffRole): string {
  return role === 'marketer' ? 'PIN з 6 цифр' : 'PIN 4–6 цифр';
}

/** The server's own sentence (a PIN someone has, a role this store lacks), else ours. */
function serverSentence(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const text = (error.response?.data as { error?: unknown } | undefined)?.error;
    if (typeof text === 'string' && text.trim() !== '') return text;
  }
  return fallback;
}

export function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<StaffRole>('seller');
  const [error, setError] = useState<string | null>(null);
  // Bumped after a PIN change, which also reopens a closed PIN login.
  const [pinVersion, setPinVersion] = useState(0);
  // The roles this store's vertical offers besides the seller: the café's
  // marketer (track МР). An older backend sends none — sellers only.
  const offersMarketer = useAuthStore((s) => s.auth?.store.vertical?.staffRoles?.includes('marketer') === true);

  async function reload() {
    setStaff(await api.listStaff());
  }

  useEffect(() => {
    void reload().catch(() => setError('Не вдалося завантажити співробітників'));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (role === 'seller') {
        await api.createSeller(name, pin);
      } else {
        await api.posRequest('post', '/staff', { display_name: name, pin, role });
      }
      setName('');
      setPin('');
      setRole('seller');
      await reload();
    } catch (err) {
      setError(serverSentence(err, `Не вдалося додати співробітника (${pinHint(role)})`));
    }
  }

  async function resetPin(member: StaffMember) {
    const next = prompt(`Новий ${pinHint(member.role === 'marketer' ? 'marketer' : 'seller')}`);
    if (!next) return;
    setError(null);
    try {
      await api.setStaffPin(member.id, next);
      setPinVersion((v) => v + 1);
      await reload();
    } catch (err) {
      setError(serverSentence(err, 'Не вдалося оновити PIN'));
    }
  }

  /** Seller ↔ marketer (М9): becoming a marketer takes a new six-digit PIN. */
  async function switchRole(member: StaffMember) {
    const next: StaffRole = member.role === 'marketer' ? 'seller' : 'marketer';
    let newPin: string | null = null;
    if (next === 'marketer') {
      newPin = prompt('Маркетолог входить у кабінет за PIN з 6 цифр. Новий PIN:');
      if (!newPin) return;
    }
    setError(null);
    try {
      await api.posRequest('patch', `/staff/${member.id}`, newPin ? { role: next, pin: newPin } : { role: next });
      setPinVersion((v) => v + 1);
      await reload();
    } catch (err) {
      setError(serverSentence(err, 'Не вдалося змінити роль'));
    }
  }

  return (
    <div className="space-y-7 animate-fade-up max-w-3xl text-sq-text">
      <PageHeader
        glyph={User}
        title="Співробітники"
        subtitle={
          offersMarketer
            ? 'Продавці заходять у касу за PIN. Маркетолог — за PIN одразу в кабінет: меню, столи й QR-меню, без виторгу й складу.'
            : 'Продавці заходять у касу за PIN.'
        }
      />

      {error && (
        <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-[15px]" role="alert">
          {error}
        </div>
      )}

      <PinLockNotice version={pinVersion} />

      <form onSubmit={onCreate} className="flex flex-col sm:flex-row gap-3">
        <input
          className="sq-input sm:flex-[2]"
          placeholder={role === 'marketer' ? 'Імʼя маркетолога' : 'Імʼя продавця'}
          aria-label="Імʼя"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        {offersMarketer && (
          <select
            className="sq-input sm:flex-1"
            aria-label="Роль"
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
            data-testid="staff-role"
          >
            <option value="seller">Продавець</option>
            <option value="marketer">Маркетолог</option>
          </select>
        )}
        <input
          className="sq-input sm:flex-1 tabular-nums"
          placeholder={role === 'marketer' ? 'PIN, 6 цифр' : 'PIN'}
          aria-label="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          required
        />
        <button type="submit" className="pos-btn-primary min-h-11 px-5 rounded-sq text-[15px] gap-1.5 shrink-0">
          <Plus size={20} />
          Додати
        </button>
      </form>

      <ul className="shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))]">
        {staff.map((member) => (
          <li key={member.id} className="sq-row min-h-[60px] py-2 flex items-center gap-3">
            <User size={24} className={`shrink-0 ${member.is_active ? '' : 'opacity-40'}`} />
            <div className="flex-1 min-w-0">
              <p className="flex items-center gap-2 min-w-0">
                <span
                  className={`text-base font-medium truncate ${member.is_active ? 'text-sq-text' : 'text-sq-muted'}`}
                >
                  {member.display_name}
                </span>
                <span className="h-[22px] px-2 rounded-md ring-1 ring-inset ring-sq-divider text-xs font-medium text-sq-secondary inline-flex items-center shrink-0">
                  {ROLE_WORDS[member.role] ?? member.role}
                </span>
              </p>
              <p className="text-[13px] text-sq-muted truncate">
                {member.login || (member.role === 'marketer' ? 'PIN-вхід у кабінет' : 'PIN-доступ')} ·{' '}
                {member.is_active ? 'активний' : 'вимкнений'}
              </p>
            </div>
            {member.role !== 'owner' && (
              <div className="flex shrink-0 items-center gap-4">
                {offersMarketer && member.is_active && (
                  <button
                    type="button"
                    className="min-h-9 text-[15px] font-semibold text-sq-blue"
                    onClick={() => void switchRole(member)}
                  >
                    {member.role === 'marketer' ? 'Зробити продавцем' : 'Зробити маркетологом'}
                  </button>
                )}
                <button
                  type="button"
                  className="min-h-9 text-[15px] font-semibold text-sq-blue"
                  onClick={() => void resetPin(member)}
                >
                  PIN
                </button>
                <button
                  type="button"
                  className={`min-h-9 text-[15px] font-semibold ${member.is_active ? 'text-red-600' : 'text-sq-blue'}`}
                  onClick={() =>
                    void api
                      .setStaffActive(member.id, !member.is_active)
                      .then(reload)
                      .catch((err: unknown) => setError(serverSentence(err, 'Не вдалося змінити')))
                  }
                >
                  {member.is_active ? 'Вимкнути' : 'Увімкнути'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
