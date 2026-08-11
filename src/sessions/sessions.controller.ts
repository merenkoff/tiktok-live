// src/sessions/sessions.controller.ts

import { FastifyInstance } from 'fastify';
import { sessionManager } from './sessions.manager.js';
import {
  startUserSession,
  stopUserSession,
  getUserSessionStatus,
} from './sessions.startup.js';
import { ensureAuth, isUnauthorizedError } from '../core/auth.js';
import { logger } from '../logger.js';

function sendAuthOrServerError(reply: any, error: unknown, fallback: string) {
  if (isUnauthorizedError(error)) {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }
  logger.error(fallback, { error });
  reply.status(500).send({
    error: error instanceof Error ? error.message : fallback,
  });
}

export async function registerSessionRoutes(fastify: FastifyInstance) {
  /**
   * Start a new session for authenticated user
   */
  fastify.post(
    '/api/sessions/start',
    async (request, reply) => {
      try {
        const { userId } = await ensureAuth(request);

        // Check if already running
        if (sessionManager.isSessionActive(userId)) {
          reply.status(400).send({ error: 'Session already running' });
          return;
        }

        logger.info(`Starting session for user ${userId}`);

        // Start session (TikTok + Telegram)
        await startUserSession(userId);

        // Get session info
        const session = sessionManager.getSession(userId);

        reply.send({
          id: session?.session.id,
          user_id: userId,
          status: 'running',
          started_at: session?.session.started_at ?? new Date().toISOString(),
          stopped_at: session?.session.stopped_at,
          created_at: session?.session.created_at,
        });
      } catch (error) {
        sendAuthOrServerError(reply, error, 'Failed to start session');
      }
    }
  );

  /**
   * Stop running session
   */
  fastify.post(
    '/api/sessions/stop',
    async (request, reply) => {
      try {
        const { userId } = await ensureAuth(request);

        if (!sessionManager.isSessionActive(userId)) {
          reply.status(400).send({ error: 'No active session' });
          return;
        }

        logger.info(`Stopping session for user ${userId}`);

        await stopUserSession(userId);

        reply.send({ success: true, message: 'Session stopped' });
      } catch (error) {
        sendAuthOrServerError(reply, error, 'Failed to stop session');
      }
    }
  );

  /**
   * Get current session info
   */
  fastify.get(
    '/api/sessions/current',
    async (request, reply) => {
      try {
        const { userId } = await ensureAuth(request);

        const session = sessionManager.getSession(userId);

        if (!session) {
          reply.send(null);
          return;
        }

        // snake_case to match admin Session type
        reply.send({
          id: session.session.id,
          user_id: session.session.user_id,
          status: session.session.status,
          started_at: session.session.started_at,
          stopped_at: session.session.stopped_at,
          created_at: session.session.created_at,
        });
      } catch (error) {
        sendAuthOrServerError(reply, error, 'Failed to get session');
      }
    }
  );

  /**
   * Get session logs
   */
  fastify.get<{ Querystring: { limit?: string; type?: string } }>(
    '/api/sessions/logs',
    async (request, reply) => {
      try {
        const { userId } = await ensureAuth(request);
        const limit = parseInt(request.query.limit || '100');
        const logType = request.query.type;

        const logs = sessionManager.getLogs(userId, limit);

        // Filter by type if provided
        const filtered = logType ? logs.filter((log) => log.log_type === logType) : logs;

        reply.send(filtered);
      } catch (error) {
        sendAuthOrServerError(reply, error, 'Failed to get logs');
      }
    }
  );

  /**
   * Get session stats and status
   */
  fastify.get(
    '/api/sessions/stats',
    async (request, reply) => {
      try {
        const { userId } = await ensureAuth(request);

        const status = await getUserSessionStatus(userId);
        const logs = sessionManager.getLogs(userId, 100);

        const orderCount = logs.filter((log) => log.log_type === 'order').length;
        const errorCount = logs.filter((log) => log.log_type === 'error').length;
        const commentCount = logs.filter(
          (log) => log.log_type === 'tiktok_comment'
        ).length;

        reply.send({
          ...status,
          logs: {
            total: logs.length,
            orders: orderCount,
            errors: errorCount,
            comments: commentCount,
          },
        });
      } catch (error) {
        sendAuthOrServerError(reply, error, 'Failed to get stats');
      }
    }
  );

  /**
   * Get all active sessions (admin)
   */
  fastify.get(
    '/api/admin/sessions',
    async (_request, reply) => {
      try {
        // No auth check for admin endpoint - add if needed
        const allSessions = sessionManager.getAllActiveSessions();
        const sessions = Array.from(allSessions.entries()).map(([userId, session]) => ({
          userId,
          sessionId: session.session.id,
          username: session.user.tiktok_username,
          status: session.session.status,
          startedAt: session.session.started_at,
          tiktokConnected: session.tiktokManager?.getStats()?.connected || false,
          logCount: session.logs.length,
        }));

        reply.send(sessions);
      } catch (error) {
        logger.error('Error getting all sessions', { error });
        reply.status(500).send({ error: 'Failed to get sessions' });
      }
    }
  );
}
