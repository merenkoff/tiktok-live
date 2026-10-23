import { useState } from 'react';
import { normalizePhone } from './useNormalizedPhone';
import { track } from '../lib/analytics';
import { journeySnapshot } from '../lib/journey';

type Status = 'idle' | 'sending' | 'success' | 'error';

/** What a lead form says about itself — the CRM's «яку форму й навіщо» (TechDocs/CRM_LEADS.md). */
export type LeadIntent = 'demo' | 'waitlist' | 'question' | 'callback' | 'live-trial';
/** A page's product: the POS, a vertical landing (its slug) or the TikTok LIVE module. */
export type LeadProduct = 'pos' | 'odyah' | 'kvity' | 'kafe' | 'restoran' | 'produkty' | 'live';
/** What the visitor said they run, on a page that could not tell («Ваш бізнес»). */
export type LeadBusiness = 'odyah' | 'kvity' | 'kafe' | 'restoran' | 'produkty' | 'live' | 'other';

export interface LeadMeta {
  formId: string;
  intent: LeadIntent;
  product?: LeadProduct;
  business?: LeadBusiness;
  /** The hidden field a person never sees; a bot fills it, the server drops the lead. */
  website?: string;
}

export function useLeadSubmit() {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function submit(phoneRaw: string, name: string | undefined, meta: LeadMeta) {
    const phone = normalizePhone(phoneRaw.trim());
    if (!phone) {
      setStatus('error');
      setMessage('Введіть коректний номер, наприклад +380 XX XXX XX XX');
      return false;
    }

    setStatus('sending');
    setMessage(null);

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          name: name?.trim() || undefined,
          form_id: meta.formId,
          intent: meta.intent,
          product: meta.product,
          business: meta.business,
          page_path: window.location.pathname,
          journey: journeySnapshot(),
          website: meta.website || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Помилка відправки');
      }

      setStatus('success');
      setMessage('Дякуємо! Ми зателефонуємо найближчим часом 📞');
      track('lead_submit', {
        page_path: window.location.pathname,
        form_id: meta.formId,
        intent: meta.intent,
        product: meta.product ?? meta.business,
      });
      return true;
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Щось пішло не так. Спробуйте ще раз.');
      return false;
    }
  }

  return { submit, status, message };
}
