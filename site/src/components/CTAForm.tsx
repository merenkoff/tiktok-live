import { FormEvent, useState } from 'react';
import { useLeadSubmit } from '../hooks/useLeadSubmit';

type Accent = 'ink' | 'live' | 'pos';

const BUTTON_CLASS: Record<Accent, string> = {
  ink: 'bg-ink hover:bg-black',
  live: 'bg-live hover:bg-live-press',
  pos: 'bg-pos hover:bg-pos-press',
};

interface Props {
  id?: string;
  accent: Accent;
  heading: string;
  subheading?: string;
  buttonLabel: string;
  showNameField?: boolean;
}

export function CTAForm({ id, accent, heading, subheading, buttonLabel, showNameField }: Props) {
  const { submit, status, message } = useLeadSubmit();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await submit(phone, name);
    if (ok) {
      setPhone('');
      setName('');
    }
  }

  return (
    <div id={id} className="bg-mist border border-line rounded-card p-6 sm:p-8">
      <h3 className="text-xl font-bold">{heading}</h3>
      {subheading && <p className="text-muted mt-1.5 text-sm">{subheading}</p>}
      <form onSubmit={onSubmit} className="mt-5 flex flex-col sm:flex-row gap-3">
        {showNameField && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ім'я"
            className="flex-1 rounded-full border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink transition-colors"
          />
        )}
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+380 XX XXX XX XX"
          inputMode="tel"
          className="flex-1 rounded-full border border-line bg-paper px-4 py-3 text-sm outline-none focus:border-ink transition-colors"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className={`shrink-0 text-white text-sm font-semibold px-6 py-3 rounded-full transition-colors disabled:opacity-60 ${BUTTON_CLASS[accent]}`}
        >
          {status === 'sending' ? 'Надсилаємо…' : buttonLabel}
        </button>
      </form>
      {message && (
        <p className={`mt-3 text-sm ${status === 'error' ? 'text-red-600' : 'text-muted'}`}>{message}</p>
      )}
    </div>
  );
}
