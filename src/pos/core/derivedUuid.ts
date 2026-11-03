// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/core/derivedUuid.ts
//
// A UUID fixed by a label. One request that writes several receipts — a debt
// paid in parts (G3_DEBTS.md §11), an order split between two registers
// (POS_DUAL_REGISTER.md §4.2) — keys each receipt from the request's own
// key, so a repeated request finds what it already wrote and writes nothing twice.

import crypto from 'node:crypto';

/** A UUID fixed by a label — the same request gives the same keys. */
export function derivedUuid(label: string): string {
  const bytes = crypto.createHash('sha256').update(label).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * The key of a request's receipt for `register` (ДК2): register 1's receipt
 * keeps the request's own key, as a single receipt always has; the others
 * are derived from it.
 */
export function registerPartUuidFor(clientUuid: string, register: number): string {
  return register <= 1 ? clientUuid : derivedUuid(`register-part:${clientUuid}:${register}`);
}
