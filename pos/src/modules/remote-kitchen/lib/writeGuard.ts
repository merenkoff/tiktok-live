// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A poll that started before a tap must not land after it: its answer is
// what the server held BEFORE the tap, and applying it would bring back the
// red line the cashier just answered, or a request the cook just took, for a
// whole poll — and invite a second tap. The same rule as `useBill`'s
// `writeSeqRef` in the tables module: a read keeps a stamp from when it
// started and is dropped if any write began or ended since, or is still on
// its way. Every write is followed by a fresh read of its own.

import { useRef } from 'react';

export interface WriteGuard {
  /** Before a write is sent. */
  begin(): void;
  /** After its answer (or refusal) came back. */
  end(): void;
  /** When a read starts. */
  stamp(): number;
  /** Whether a read that started at `stamp` may still be applied. */
  fresh(stamp: number): boolean;
}

export function createWriteGuard(): WriteGuard {
  let seq = 0;
  let writing = 0;
  return {
    begin() {
      writing += 1;
      seq += 1;
    },
    end() {
      writing = Math.max(0, writing - 1);
      seq += 1;
    },
    stamp: () => seq,
    fresh: (stamp) => writing === 0 && stamp === seq,
  };
}

/** One guard for the life of the component. */
export function useWriteGuard(): WriteGuard {
  const ref = useRef<WriteGuard | null>(null);
  if (ref.current == null) ref.current = createWriteGuard();
  return ref.current;
}
