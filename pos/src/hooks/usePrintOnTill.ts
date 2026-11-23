// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A phone's receipt printed on the till's computer (TechDocs/POS_PHONE_TILL.md
// Т2, the owner's word of 2026-11-23): the sale asked for it (`print_on_till`),
// and the success screen says whether the paper came out — «Друкується на
// касі…», «Надруковано на касі», or, after twenty seconds of nothing, that the
// computer did not print it, with «Друкувати ще раз».
//
// It reads `GET /sales/:id/print-status` every two seconds for half a minute
// and then stops: the queue keeps a phone's receipt ten minutes, but nobody
// stares at the success screen that long. A store whose computer never asked
// for receipts (none has the printer, or there is no computer), a server older
// than Т2 and an error show nothing at all.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@pos/platform';

/**
 * `offline` — the computer that prints was on before and is not now (no
 * light?); `silent` — it is on but has not printed in twenty seconds.
 */
export type TillPrintState = 'idle' | 'waiting' | 'printed' | 'silent' | 'offline' | 'refused';

export interface TillPrint {
  state: TillPrintState;
  /** The server's sentence when it refused to print again. */
  refusal: string | null;
  busy: boolean;
  /** Queue the receipts again — a copy once one has printed. */
  again: () => Promise<void>;
}

export interface TillPrintTiming {
  intervalMs: number;
  /** After this long without paper, say the computer did not print it. */
  quietAfterMs: number;
  /** Stop asking. */
  stopAfterMs: number;
}

const TIMING: TillPrintTiming = { intervalMs: 2000, quietAfterMs: 20000, stopAfterMs: 30000 };

function refusalOf(error: unknown): string {
  const data = (error as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' ? data.error : 'Не вдалося надіслати чек на касу';
}

export function usePrintOnTill(saleIds: readonly number[] | null, timing: TillPrintTiming = TIMING): TillPrint {
  const key = saleIds && saleIds.length > 0 ? saleIds.join(',') : '';
  const [state, setState] = useState<TillPrintState>('idle');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Bumped by «Друкувати ще раз» so the poll starts over. */
  const [round, setRound] = useState(0);
  const timingRef = useRef(timing);
  timingRef.current = timing;

  useEffect(() => {
    if (!key) {
      setState('idle');
      return;
    }
    const ids = key.split(',').map(Number);
    const { intervalMs, quietAfterMs, stopAfterMs } = timingRef.current;
    const started = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      try {
        const statuses = await Promise.all(ids.map((id) => api.receiptPrintStatus(id)));
        if (stopped) return;
        if (statuses.some((s) => !s.requested_at)) {
          // Not in the queue (an older server): say nothing.
          setState('idle');
          return;
        }
        if (statuses.every((s) => s.printed_at)) {
          setState('printed');
          return;
        }
        const till = statuses[0].till ?? 'none';
        if (till === 'none') {
          setState('idle');
          return;
        }
        if (till === 'offline') {
          setState('offline');
          return;
        }
        const elapsed = Date.now() - started;
        setState(elapsed >= quietAfterMs ? 'silent' : 'waiting');
        if (elapsed < stopAfterMs) timer = setTimeout(() => void tick(), intervalMs);
        else setState('silent');
      } catch {
        if (!stopped) setState('idle');
      }
    };
    setState('waiting');
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, round]);

  const again = useCallback(async () => {
    if (!key) return;
    setBusy(true);
    setRefusal(null);
    try {
      for (const id of key.split(',').map(Number)) await api.requestReceiptPrint(id);
      setRound((r) => r + 1);
    } catch (error) {
      setRefusal(refusalOf(error));
      setState('refused');
    } finally {
      setBusy(false);
    }
  }, [key]);

  return { state, refusal, busy, again };
}
