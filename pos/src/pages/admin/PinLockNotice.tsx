// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/pages/admin/PinLockNotice.tsx
//
// «Співробітники»: PIN login closed after wrong PINs at the till (migration
// 081, src/pos/pin-attempts.ts). Five misses in a row close it for a while,
// the tenth for an hour; it opens again by itself, on a right PIN, on the
// owner's «Розблокувати», or when the owner sets anyone a new PIN — which is
// why the page re-reads this after every PIN change (`version`).
//
// Reached through `api.posRequest`, so the `@pos/platform` surface does not
// move for it. Silent on any failure: an older backend has no such endpoint,
// and a notice that cannot load must not put an error over the staff list.

import { useCallback, useEffect, useState } from 'react';
import { api } from '@pos/platform';

interface PinLockStatus {
  misses: number;
  locked_until: string | null;
  blocked: boolean;
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

export function PinLockNotice({ version = 0 }: { version?: number }) {
  const [status, setStatus] = useState<PinLockStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api.posRequest<PinLockStatus>('get', '/staff/pin-lock'));
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  async function unblock() {
    setSaving(true);
    setError(null);
    try {
      setStatus(await api.posRequest<PinLockStatus>('post', '/staff/pin-lock/reset'));
    } catch {
      setError('Не вдалося розблокувати. Спробуйте ще раз.');
    } finally {
      setSaving(false);
    }
  }

  if (!status?.locked_until) return null;

  return (
    <div role="alert" className="rounded-xl bg-amber-50 text-amber-900 px-4 py-3 space-y-2.5">
      <p className="text-[15px] font-semibold">
        {status.blocked
          ? `Вхід за PIN заблоковано до ${clock(status.locked_until)}`
          : `Вхід за PIN закрито до ${clock(status.locked_until)}`}
      </p>
      <p className="text-[13px] leading-relaxed">
        {status.blocked
          ? `На касі ввели неправильний PIN ${status.misses} разів поспіль. `
          : `На касі ввели неправильний PIN ${status.misses} разів поспіль; кожна наступна помилка подовжує паузу, а десята закриє вхід на годину. `}
        Касири, які вже увійшли, працюють далі. Помилялися ваші працівники — розблокуйте. Якщо ні, хтось
        підбирає PIN: дайте працівникам довші PIN-коди, з 6 цифр (новий PIN теж знімає блок).
      </p>
      <button type="button" className="sq-btn-primary" disabled={saving} onClick={() => void unblock()}>
        Розблокувати
      </button>
      {error && <p className="text-[13px] text-red-700">{error}</p>}
    </div>
  );
}
