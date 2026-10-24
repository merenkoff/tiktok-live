// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/cashalot/lookup.ts
//
// Find the document Cashalot already registered under our request id.
//
// Cashalot refuses a repeat of a `UID` (`DuplicatedRequestUid`, support
// answer 8) but, unlike Checkbox, does not name the document it made — and
// `resolveDuplicate` needs that number to read it back, or the row is parked
// for the owner. So the adapter looks for it: the register's newest documents
// of the current shift, newest first, each one's original XML checked for our
// `CHECKHEAD.UID` (the check carries a copy of the request's UID there).
// Best effort: any failure is "not found", which parks the row exactly as
// Checkbox's unresolved duplicate does. Whether the UID survives into the
// stored XML is CA3 probe 4b; if it does not, this returns null and nothing
// worse happens.

import {
  decodeBase64Text,
  documentInfoByLocalNum,
  getCheck,
  registrarState,
  type CashalotCreds,
} from './client.js';

/** The newest documents worth reading: a retry follows its first attempt closely. */
export const LOOKUP_DEPTH = 5;

function hasUid(xml: string, uid: string): boolean {
  const escaped = uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<UID>\\s*${escaped}\\s*</UID>`, 'i').test(xml);
}

export async function findDocumentByUid(
  creds: CashalotCreds,
  uid: string,
  opts: { signal: AbortSignal; baseUrl?: string }
): Promise<string | null> {
  try {
    const state = await registrarState(creds, opts);
    const next = Number(state.NextLocalNum ?? 0);
    const first = Math.max(1, Number(state.FirstLocalNum ?? 1));
    for (let local = next - 1; local >= first && local >= next - LOOKUP_DEPTH; local--) {
      if (opts.signal.aborted) return null;
      const info = await documentInfoByLocalNum(creds, local, opts).catch(() => null);
      if (!info?.NumFiscal || (info.DocClass && info.DocClass !== 'Check')) continue;
      const numFiscal = String(info.NumFiscal);
      const original = await getCheck(creds.numFiscal, numFiscal, 'OriginalXml', opts).catch(() => null);
      const xml = decodeBase64Text(original?.Data);
      if (xml && hasUid(xml, uid)) return numFiscal;
    }
    return null;
  } catch {
    return null;
  }
}
