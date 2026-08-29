// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/core/auth.ts

import type { FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../../db.js';
import type { PosAuthContext, PosRole } from '../types.js';

const SESSION_TTL_HOURS = 24 * 14;

declare module 'fastify' {
  interface FastifyRequest {
    posAuth?: PosAuthContext;
  }
}

export function sessionExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);
}

export async function getAuthByToken(token: string): Promise<PosAuthContext | null> {
  const result = await pool.query(
    `SELECT
       s.id AS session_id,
       s.token,
       s.store_id,
       s.staff_id,
       st.role,
       st.display_name,
       st.is_active AS staff_active,
       store.name AS store_name,
       store.slug AS store_slug,
       store.currency
     FROM pos_sessions s
     JOIN pos_staff st ON st.id = s.staff_id
     JOIN pos_stores store ON store.id = s.store_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  if (!row.staff_active) return null;

  return {
    sessionId: Number(row.session_id),
    storeId: Number(row.store_id),
    staffId: Number(row.staff_id),
    role: row.role as PosRole,
    displayName: row.display_name,
    storeName: row.store_name,
    storeSlug: row.store_slug,
    currency: row.currency,
    token: row.token,
  };
}

function extractBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

export async function ensurePosAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<PosAuthContext | null> {
  const token = extractBearer(request);
  if (!token) {
    await reply.code(401).send({ error: 'Unauthorized' });
    return null;
  }

  const auth = await getAuthByToken(token);
  if (!auth) {
    await reply.code(401).send({ error: 'Invalid or expired session' });
    return null;
  }

  request.posAuth = auth;
  return auth;
}

export async function ensurePosOwner(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<PosAuthContext | null> {
  const auth = await ensurePosAuth(request, reply);
  if (!auth) return null;
  if (auth.role !== 'owner') {
    await reply.code(403).send({ error: 'Owner access required' });
    return null;
  }
  return auth;
}
