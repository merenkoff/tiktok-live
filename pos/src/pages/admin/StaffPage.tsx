import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { StaffMember } from '../../types';

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
    <div className="space-y-6 animate-fade-up text-sq-text">
      <div>
        <h2 className="text-2xl font-semibold">Співробітники</h2>
        <p className="text-sq-secondary mt-1 text-sm">Продавці заходять у касу за PIN.</p>
      </div>

      {error && <div className="rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <form
        onSubmit={onCreate}
        className="bg-sq-surface border border-sq-divider rounded-sq p-5 grid sm:grid-cols-3 gap-3 shadow-sm"
      >
        <input
          className="rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sm text-sq-text"
          placeholder="Імʼя продавця"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sm text-sq-text"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          required
        />
        <button type="submit" className="sq-btn-primary px-4 py-2.5">
          Додати
        </button>
      </form>

      <ul className="bg-sq-surface border border-sq-divider rounded-sq divide-y divide-sq-divider shadow-sm">
        {staff.map((member) => (
          <li key={member.id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-sq-text">
                {member.display_name}{' '}
                <span className="text-xs font-medium text-sq-secondary">
                  {member.role === 'owner' ? 'власник' : 'продавець'}
                </span>
              </p>
              <p className="text-xs text-sq-secondary">
                {member.login || 'PIN-доступ'} · {member.is_active ? 'активний' : 'вимкнений'}
              </p>
            </div>
            {member.role === 'seller' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-sm font-semibold text-sq-blue"
                  onClick={() => void resetPin(member.id)}
                >
                  PIN
                </button>
                <button
                  type="button"
                  className="text-sm font-semibold text-sq-secondary"
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
