// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

import type { FastifyRequest } from 'fastify';

/** Header the desktop cashier sends to identify itself (`pos/src/offline/db.ts getDeviceId`). */
export const DEVICE_ID_HEADER = 'x-pos-device-id';
const DEVICE_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/**
 * The till's device id, or null when the caller sent none (web shell, curl)
 * or sent garbage. Only the desktop cashier has one; it is what the register
 * holder (TechDocs/POS_FISCAL_OFFLINE.md §3а) is keyed on.
 */
export function readDeviceId(request: FastifyRequest): string | null {
  const raw = request.headers[DEVICE_ID_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return DEVICE_ID_RE.test(trimmed) ? trimmed : null;
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  );
}
