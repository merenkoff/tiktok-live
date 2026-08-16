import { FormEvent, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cashierApi } from '../../offline/cashierApi';
import type { PosCustomer } from '../../types';

interface Props {
  onClose: () => void;
  onSelect: (customer: PosCustomer | null) => void;
  currentId?: number | null;
}

export function CustomerPicker({ onClose, onSelect, currentId }: Props) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<PosCustomer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  async function search(term = q) {
    setList(await cashierApi.listCustomers(term || undefined));
  }

  useEffect(() => {
    void search().catch(() => setError('Не вдалося завантажити'));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const c = await cashierApi.createCustomer({ name, phone });
      onSelect(c);
      onClose();
    } catch {
      setError('Не вдалося створити');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Закрити" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[85dvh] bg-white rounded-t-sq sm:rounded-sq flex flex-col shadow-lg animate-fade-up">
        <div className="px-4 py-3 border-b border-sq-divider flex items-center justify-between">
          <p className="font-semibold">Клієнт чека</p>
          <button type="button" className="min-h-10 min-w-10 grid place-items-center" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="p-3 space-y-2 border-b border-sq-divider">
          <input
            className="pos-field text-sm"
            placeholder="Пошук…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search(q);
            }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="text-sm font-medium text-sq-blue"
              onClick={() => void search(q)}
            >
              Шукати
            </button>
            <button
              type="button"
              className="text-sm font-medium text-sq-blue"
              onClick={() => setShowCreate((v) => !v)}
            >
              {showCreate ? 'Сховати форму' : '+ Новий'}
            </button>
            <button
              type="button"
              className="ml-auto text-sm text-sq-secondary"
              onClick={() => {
                onSelect(null);
                onClose();
              }}
            >
              Без клієнта
            </button>
          </div>
        </div>

        {error && <p className="px-4 pt-2 text-sm text-red-600">{error}</p>}

        {showCreate && (
          <form onSubmit={(e) => void create(e)} className="p-3 space-y-2 border-b border-sq-divider">
            <input
              className="pos-field text-sm"
              placeholder="Ім’я *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              className="pos-field text-sm"
              placeholder="Телефон *"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <button type="submit" className="pos-btn-primary w-full py-2.5 text-sm">
              Створити і вибрати
            </button>
          </form>
        )}

        <ul className="flex-1 overflow-auto">
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`w-full text-left px-4 py-3 hover:bg-sq-bg border-b border-sq-divider ${
                  currentId === c.id ? 'bg-sq-blue/5' : ''
                }`}
                onClick={() => {
                  onSelect(c);
                  onClose();
                }}
              >
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-sq-secondary">{c.phone}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
