// src/core/auth.ts

import { FastifyRequest /*, FastifyReply */ } from 'fastify';
import * as usersService from '../users/users.service.js';
import { logger } from '../logger.js';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      user?: any;
    }
  }
}

// Simple token (in production use JWT)
interface AuthToken {
  userId: number;
  username: string;
}

const activeTokens = new Map<string, AuthToken>();

export async function loginUser(tiktok_username: string): Promise<{
  token: string;
  user: any;
}> {
  try {
    // Create or get user
    const user = await usersService.createOrGetUser(tiktok_username);

    // Create token
    const token = `token_${user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    activeTokens.set(token, {
      userId: user.id,
      username: user.tiktok_username,
    });

    logger.info(`User logged in: ${tiktok_username}`);

    return { token, user };
  } catch (error) {
    logger.error('Login failed', { error, tiktok_username });
    throw error;
  }
}

export function logoutUser(token: string): void {
  activeTokens.delete(token);
}

export function verifyToken(token: string): AuthToken | null {
  return activeTokens.get(token) || null;
}

/**
 * Fastify auth hook
 */
export async function authMiddleware(
  request: FastifyRequest
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // reply.status(401).send({ error: 'Unauthorized' });
      logger.error('Unauthorized 401');
      return;
    }

    const token = authHeader.substring(7);
    const auth = verifyToken(token);

    if (!auth) {
      // reply.status(401).send({ error: 'Invalid token' });
      logger.error('Invalid token 401');
      return;
    }

    // Attach to request
    (request as any).userId = auth.userId;
    (request as any).username = auth.username;
  } catch (error) {
    logger.error('Auth middleware error', { error });
    // throw error;
    // reply.status(500).send({ error: 'Internal error' });
  }
}

/**
 * Ensure authenticated
 */
export function ensureAuth(
  request: FastifyRequest
): { userId: number; username: string } {
  authMiddleware(request)
  const userId = (request as any).userId;
  const username = (request as any).username;

  if (!userId || !username) {
    throw new Error('Unauthorized');
  }

  return { userId, username };
}
