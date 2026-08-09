import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuthStore } from '../../hooks/useAuth';

export function SettingsPage() {
  const auth = useAuthStore((s) => s.auth);
  const [name, setName] = useState(auth?.store.name ?? '');
  const [slug, setSlug] = useState(auth?.store.slug ?? '');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api.getStore().then((store) => {
      setName(store.name);
      setSlug(store.slug);
    });
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    try {
      const store = await api.updateStore(name);
      setName(store.name);
      setMessage('Збережено');
    } catch {
      setMessage('Помилка збереження');
    }
  }

  return (
    <div className="space-y-6 animate-fade-up max-w-xl text-sq-text">
      <div>
        <h2 className="text-2xl font-semibold">Налаштування</h2>
        <p className="text-sq-secondary mt-1 text-sm">Базові параметри магазину.</p>
      </div>

      <form onSubmit={onSave} className="bg-sq-surface border border-sq-divider rounded-sq p-5 space-y-4 shadow-sm">
        <label className="block">
          <span className="text-sm text-sq-secondary">Назва магазину</span>
          <input
            className="mt-1.5 w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sq-text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm text-sq-secondary">Код для PIN-входу</span>
          <input
            className="mt-1.5 w-full rounded-sq border border-sq-divider bg-sq-empty px-3 py-2.5 text-sq-secondary"
            value={slug}
            disabled
          />
        </label>
        <p className="text-sm text-sq-secondary">Валюта: грн (UAH)</p>
        {message && <p className="text-sm text-sq-blue font-medium">{message}</p>}
        <button type="submit" className="sq-btn-primary px-4 py-2.5">
          Зберегти
        </button>
      </form>
    </div>
  );
}
