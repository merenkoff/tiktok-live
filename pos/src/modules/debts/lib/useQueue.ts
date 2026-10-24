// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The desktop's queue as a screen reads it: every row of this store still on
// the till — waiting, failing or refused — re-read whenever the queue moves.
// Empty everywhere else: only the desktop writes without a network.

import { useEffect, useRef, useState } from 'react';
import { isOfflinePosEnabled, useAuthStore } from '@pos/platform';
import type { IssueRow } from '../data/db';
import { onQueueChange, queueRows } from '../data/queue';

const NONE: IssueRow[] = [];

export function useQueue(customerId?: number): IssueRow[] {
  const storeId = useAuthStore((s) => s.auth?.store.id ?? null);
  const queue = isOfflinePosEnabled();
  const [rows, setRows] = useState<IssueRow[]>(NONE);

  useEffect(() => {
    if (!queue || storeId == null) {
      setRows(NONE);
      return undefined;
    }
    let live = true;
    const read = () => {
      void queueRows(storeId).then((next) => {
        if (!live) return;
        setRows(customerId == null ? next : next.filter((row) => row.customerId === customerId));
      });
    };
    read();
    const off = onQueueChange(read);
    return () => {
      live = false;
      off();
    };
  }, [queue, storeId, customerId]);

  return rows;
}

/**
 * Calls `onDrained` whenever a row has left the queue — sent, or removed by a
 * person. A screen that read the server before the row arrived there reads it
 * again: the network coming back starts the page's read and the queue's send
 * at the same moment, and the read usually wins.
 */
export function useQueueDrained(rows: readonly IssueRow[], onDrained: () => void): void {
  const before = useRef(new Set(rows.map((row) => row.id)));
  useEffect(() => {
    const now = new Set(rows.map((row) => row.id));
    const left = [...before.current].some((id) => !now.has(id));
    before.current = now;
    if (left) onDrained();
  }, [rows, onDrained]);
}
