import { FormEvent, useState } from 'react';
import { useLeadSubmit } from '../hooks/useLeadSubmit';

type Accent = 'ink' | 'live' | 'pos';

const BUTTON_CLASS: Record<Accent, string> = {
  ink: 'btn bg-ink hover:bg-ink-strong',
  live: 'btn-live',
  pos: 'btn-pos',
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
    <div id={id} className="card p-6 sm:p-8 scroll-mt-24">
      <h3 className="text-[22px] font-bold text-ink-strong">{heading}</h3>
      {subheading && <p className="text-muted mt-1.5 text-[15px] leading-relaxed">{subheading}</p>}
      <form onSubmit={onSubmit} className="mt-5 flex flex-col sm:flex-row gap-3">
        {showNameField && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ім'я"
            aria-label="Ім'я"
            className="flex-1 h-12 rounded-xl bg-side px-4 text-[15px] outline-none placeholder:text-faint focus:bg-paper focus:ring-2 focus:ring-pos/40 transition"
          />
        )}
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+380 XX XXX XX XX"
          inputMode="tel"
          aria-label="Телефон"
          className="flex-1 h-12 rounded-xl bg-side px-4 text-[15px] outline-none placeholder:text-faint focus:bg-paper focus:ring-2 focus:ring-pos/40 transition"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className={`shrink-0 disabled:opacity-60 ${BUTTON_CLASS[accent]}`}
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
