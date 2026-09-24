// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@pos/platform';
import type { StaffMember } from '../../types';
import { PageHeader } from '../../components/ui/Page';
import { Plus, User } from '../../platform/glyphs';

export function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setStaff(await api.listStaff());
  }

  useEffect(() => {
    void reload().catch(() => setError('Не вдалося завантажити співробітників'));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createSeller(name, pin);
      setName('');
      setPin('');
      await reload();
    } catch {
      setError('Не вдалося створити продавця (PIN 4–6 цифр)');
    }
  }

  async function resetPin(id: number) {
    const next = prompt('Новий PIN (4–6 цифр)');
    if (!next) return;
    try {
      await api.setStaffPin(id, next);
      await reload();
    } catch {
      setError('Не вдалося оновити PIN');
    }
  }

  return (
    <div className="space-y-7 animate-fade-up max-w-3xl text-sq-text">
      <PageHeader glyph={User} title="Співробітники" subtitle="Продавці заходять у касу за PIN." />

      {error && <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-[15px]">{error}</div>}

      <form onSubmit={onCreate} className="flex flex-col sm:flex-row gap-3">
        <input
          className="sq-input sm:flex-[2]"
          placeholder="Імʼя продавця"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="sq-input sm:flex-1 tabular-nums"
          placeholder="PIN"
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
                  {member.role === 'owner' ? 'власник' : 'продавець'}
                </span>
              </p>
              <p className="text-[13px] text-sq-muted truncate">
                {member.login || 'PIN-доступ'} · {member.is_active ? 'активний' : 'вимкнений'}
              </p>
            </div>
            {member.role === 'seller' && (
              <div className="flex shrink-0 items-center gap-4">
                <button
                  type="button"
                  className="min-h-9 text-[15px] font-semibold text-sq-blue"
                  onClick={() => void resetPin(member.id)}
                >
                  PIN
                </button>
                <button
                  type="button"
                  className={`min-h-9 text-[15px] font-semibold ${member.is_active ? 'text-red-600' : 'text-sq-blue'}`}
                  onClick={() =>
                    void api.setStaffActive(member.id, !member.is_active).then(reload)
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
