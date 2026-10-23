import { FormEvent, useState } from 'react';
import { type LeadBusiness, type LeadIntent, type LeadProduct, useLeadSubmit } from '../hooks/useLeadSubmit';

type Accent = 'ink' | 'live' | 'pos';

const BUTTON_CLASS: Record<Accent, string> = {
  ink: 'btn bg-ink hover:bg-ink-strong',
  live: 'btn-live',
  pos: 'btn-pos',
};

/** «Ваш бізнес» — asked only where the page cannot tell, never required. */
const BUSINESSES: Array<{ id: LeadBusiness; label: string }> = [
  { id: 'odyah', label: 'Одяг' },
  { id: 'kvity', label: 'Квіти' },
  { id: 'kafe', label: 'Кафе' },
  { id: 'restoran', label: 'Ресторан' },
  { id: 'produkty', label: 'Продукти' },
  { id: 'live', label: 'TikTok LIVE' },
  { id: 'other', label: 'Інше' },
];

interface Props {
  id?: string;
  /**
   * Which form this is, as the CRM lists it (`pos-bottom`, `vertical-kafe`,
   * `dovidka:<slug>` …) — one id per place, so a lead says where it was left.
   */
  formId: string;
  /** What the person asks for: a demo, a place on the waitlist, an answer, a call, a LIVE trial. */
  intent: LeadIntent;
  /** The product the page is about, when it is about one. */
  product?: LeadProduct;
  /** Show the «Ваш бізнес» chips — on pages that could be about any business. */
  askBusiness?: boolean;
  accent: Accent;
  heading: string;
  subheading?: string;
  buttonLabel: string;
  showNameField?: boolean;
}

export function CTAForm({
  id,
  formId,
  intent,
  product,
  askBusiness,
  accent,
  heading,
  subheading,
  buttonLabel,
  showNameField,
}: Props) {
  const { submit, status, message } = useLeadSubmit();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [business, setBusiness] = useState<LeadBusiness | undefined>(undefined);
  const [website, setWebsite] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await submit(phone, name, { formId, intent, product, business, website });
    if (ok) {
      setPhone('');
      setName('');
      setBusiness(undefined);
    }
  }

  return (
    <div id={id} className="card p-6 sm:p-8 scroll-mt-24">
      <h3 className="text-[22px] font-bold text-ink-strong">{heading}</h3>
      {subheading && <p className="text-muted mt-1.5 text-[15px] leading-relaxed">{subheading}</p>}
      <form onSubmit={onSubmit} className="mt-5">
        {askBusiness && (
          <fieldset className="mb-4">
            <legend className="text-[13px] font-semibold text-muted mb-2">Ваш бізнес (за бажанням)</legend>
            <div className="flex flex-wrap gap-2">
              {BUSINESSES.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={business === b.id}
                  onClick={() => setBusiness(business === b.id ? undefined : b.id)}
                  className={`h-9 px-3.5 rounded-full text-[14px] font-medium transition ${
                    business === b.id ? 'bg-ink text-paper' : 'bg-side text-ink hover:bg-selected'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          {showNameField && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ім'я"
              aria-label="Ім'я"
              maxLength={80}
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
          {/* Out of sight and out of the tab order: only a bot fills it, and the server drops what it sends. */}
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] w-px h-px opacity-0"
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className={`shrink-0 disabled:opacity-60 ${BUTTON_CLASS[accent]}`}
          >
            {status === 'sending' ? 'Надсилаємо…' : buttonLabel}
          </button>
        </div>
      </form>
      {message && (
        <p className={`mt-3 text-sm ${status === 'error' ? 'text-red-600' : 'text-muted'}`}>{message}</p>
      )}
    </div>
  );
}
