// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The `client_uuid` of one statement sheet's write — a repayment, a return, a
// write-off (G3_DEBTS.md §5, decision 5): the same key after no answer, a new
// one after any answer, and — through `pendingKeys` — the same key again when
// the sheet is opened anew after a write of its scope got no answer.

import { useRef, useState } from 'react';
import { rememberUnanswered, settle, unansweredKey } from './pendingKeys';

export interface WriteKey {
  /** The key to send now. */
  current: () => string;
  /** This sheet opened on an earlier write of its scope that got no answer. */
  replaying: boolean;
  /** No answer came: keep the key, here and for the next sheet of this scope. */
  unanswered: () => void;
  /** The server answered — a result or a refusal: the next write is a new one. */
  answered: () => void;
}

export function useWriteKey(scope: string): WriteKey {
  const [initial] = useState(() => {
    const replay = unansweredKey(scope);
    return { key: replay ?? crypto.randomUUID(), replaying: replay != null };
  });
  const key = useRef(initial.key);
  return {
    current: () => key.current,
    replaying: initial.replaying,
    unanswered: () => rememberUnanswered(scope, key.current),
    answered: () => {
      settle(scope);
      key.current = crypto.randomUUID();
    },
  };
}
