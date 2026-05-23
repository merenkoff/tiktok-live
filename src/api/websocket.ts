// src/api/websocket.ts

import websocket, { WebSocket } from '@fastify/websocket';
import { RawData } from 'ws';
import { FastifyInstance, FastifyRequest } from 'fastify';

import { sessionManager } from '../sessions/sessions.manager.js';
import { verifyToken } from '../core/auth.js';
import { logger } from '../logger.js';

type LogsStreamQuery = {
  Querystring: {
    token?: string;
  };
};

export async function setupWebSocket(
  fastify: FastifyInstance
): Promise<void> {

  // Register WebSocket plugin
  await fastify.register(websocket);

  fastify.get<LogsStreamQuery>(
    '/api/sessions/logs/stream',
    { websocket: true },

    async (
      socket: WebSocket,
      request: FastifyRequest<LogsStreamQuery>
    ) => {

      try {
        // Auth via query params
        const token = request.query.token;

        if (!token) {
          socket.close();
          return;
        }

        // Verify token
        const auth = verifyToken(token);

        if (!auth) {
          socket.close();
          return;
        }

        const userId = auth.userId;

        logger.info(`WebSocket connected for user ${userId}`);

        // Send initial logs
        const initialLogs = sessionManager.getLogs(userId, 100);

        socket.send(JSON.stringify({
          type: 'initial',
          logs: initialLogs,
          timestamp: new Date().toISOString(),
        }));

        // Send welcome message
        socket.send(JSON.stringify({
          type: 'connected',
          message: 'Connected to live logs',
          timestamp: new Date().toISOString(),
        }));

        // Listen for new logs
        const onLogAdded = (event: any) => {
          if (event.user_id === userId) {
            try {

              socket.send(JSON.stringify({
                type: 'log',
                log: event.log,
                timestamp: new Date().toISOString(),
              }));

            } catch (error) {

              logger.error('Error sending log via WebSocket', {
                error,
              });

            }
          }
        };

        sessionManager.on('logAdded', onLogAdded);

        // Session started
        const onSessionStarted = (event: any) => {
          if (event.user_id === userId) {

            socket.send(JSON.stringify({
              type: 'sessionStarted',
              sessionId: event.sessionId,
              username: event.username,
              timestamp: new Date().toISOString(),
            }));

          }
        };

        // Session stopped
        const onSessionStopped = (event: any) => {
          if (event.user_id === userId) {

            socket.send(JSON.stringify({
              type: 'sessionStopped',
              sessionId: event.sessionId,
              timestamp: new Date().toISOString(),
            }));

          }
        };

        sessionManager.on('sessionStarted', onSessionStarted);
        sessionManager.on('sessionStopped', onSessionStopped);

        // Incoming messages
        socket.on('message', (data: RawData)=> {

          try {

            const message = JSON.parse(data.toString());

            logger.debug(
              `WebSocket message from user ${userId}:`,
              message
            );

            if (message.type === 'ping') {

              socket.send(JSON.stringify({
                type: 'pong',
              }));

            }

          } catch (error) {

            logger.error(
              'Error handling WebSocket message',
              { error }
            );

          }
        });

        // Disconnect
        socket.on('close', () => {

          sessionManager.off('logAdded', onLogAdded);
          sessionManager.off('sessionStarted', onSessionStarted);
          sessionManager.off('sessionStopped', onSessionStopped);

          logger.info(
            `WebSocket disconnected for user ${userId}`
          );
        });

        // Error
        socket.on('error', (error) => {

          logger.error('WebSocket error', {
            error,
            userId,
          });

        });

      } catch (error) {

        logger.error('WebSocket setup error', {
          error,
        });

        socket.close();
      }
    }
  );
}