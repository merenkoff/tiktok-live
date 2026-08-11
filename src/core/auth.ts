// src/core/auth.ts

import crypto from 'crypto';
import { FastifyRequest } from 'fastify';
import * as usersService from '../users/users.service.js';
import { logger } from '../logger.js';

interface AuthToken {
  userId: number;
  username: string;
}

interface TokenPayload {
  userId: number;
  username: string;
  iat: number;
  exp: number;
}

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const AUTH_SECRET = process.env.AUTH_SECRET || 'tiktok-live-dev-secret';

/** Revoked tokens until expiry (logout). Survives process memory only — signed tokens stay valid across restarts. */
const revokedTokens = new Set<string>();

function sign(payloadB64: string): string {
  return crypto.createHmac('sha256', AUTH_SECRET).update(payloadB64).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createSignedToken(userId: number, username: string): string {
  const now = Date.now();
  const payload: TokenPayload = {
    userId,
    username,
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export async function loginUser(tiktok_username: string): Promise<{
  token: string;
  user: any;
}> {
  try {
    const user = await usersService.createOrGetUser(tiktok_username);

    // Ensure settings row exists so session start works without visiting Settings first
    await usersService.ensureDefaultSettings(user.id, user.tiktok_username);

    const token = createSignedToken(user.id, user.tiktok_username);
    revokedTokens.delete(token);

    logger.info(`User logged in: ${tiktok_username}`);

    return { token, user };
  } catch (error) {
    logger.error('Login failed', { error, tiktok_username });
    throw error;
  }
}

export function logoutUser(token: string): void {
  if (token) {
    revokedTokens.add(token);
  }
}

export function verifyToken(token: string): AuthToken | null {
  if (!token || revokedTokens.has(token)) {
    return null;
  }

  // New signed format: payload.signature
  const parts = token.split('.');
  if (parts.length === 2) {
    const [payloadB64, signature] = parts;
    if (!payloadB64 || !signature || !safeEqual(signature, sign(payloadB64))) {
      return null;
    }

    try {
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8')
      ) as TokenPayload;

      if (!payload?.userId || !payload?.username || !payload?.exp) {
        return null;
      }
      if (Date.now() > payload.exp) {
        return null;
      }

      return { userId: payload.userId, username: payload.username };
    } catch {
      return null;
    }
  }

  // Legacy in-memory tokens are no longer valid after restart
  return null;
}

/**
 * Fastify auth hook — attaches user to request when token is valid
 */
export async function authMiddleware(request: FastifyRequest): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return;
    }

    const token = authHeader.substring(7);
    const auth = verifyToken(token);

    if (!auth) {
      return;
    }

    (request as any).userId = auth.userId;
    (request as any).username = auth.username;
  } catch (error) {
    logger.error('Auth middleware error', { error });
  }
}

/**
 * Ensure authenticated — throws Error with message 'Unauthorized'
 */
export async function ensureAuth(
  request: FastifyRequest
): Promise<{ userId: number; username: string }> {
  await authMiddleware(request);

  const userId = (request as any).userId;
  const username = (request as any).username;

  if (!userId || !username) {
    throw new Error('Unauthorized');
  }

  return { userId, username };
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Unauthorized';
}
