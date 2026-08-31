import { useState } from 'react';
import { normalizePhone } from './useNormalizedPhone';

type Status = 'idle' | 'sending' | 'success' | 'error';

export function useLeadSubmit() {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function submit(phoneRaw: string, name?: string) {
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
        body: JSON.stringify({ phone, name: name?.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Помилка відправки');
      }

      setStatus('success');
      setMessage('Дякуємо! Ми зателефонуємо найближчим часом 📞');
      return true;
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Щось пішло не так. Спробуйте ще раз.');
      return false;
    }
  }

  return { submit, status, message };
}
