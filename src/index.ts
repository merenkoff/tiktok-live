// src/index.ts

import 'dotenv/config';
import cron from 'node-cron';
import { logger } from './logger.js';
import { initializeDatabase } from './db.js';
import { createServer, startServer } from './api.js';
import { setupWebSocket } from './api/websocket.js';
import { registerUserRoutes } from './users/users.controller.js';
import { registerSettingsRoutes } from './users/settings.controller.js';
import { registerSessionRoutes } from './sessions/sessions.controller.js';
import { cleanupExpiredReservations } from './reservations.js';
import { sessionManager } from './sessions/sessions.manager.js';

/**
 * Graceful shutdown
 */
process.on('SIGINT', async () => {
  logger.info('🛑 Shutting down gracefully...');

  try {
    // Stop all active sessions
    const stats = sessionManager.getStats();
    logger.info(`Stopping ${stats.activeSessionsCount} active sessions...`);

    for (const userId of stats.userIds) {
      try {
        await sessionManager.stopSession(userId);
        logger.info(`✅ Session stopped for user ${userId}`);
      } catch (error) {
        logger.error(`Error stopping session for user ${userId}`, { error });
      }
    }

    logger.info('✅ All sessions stopped');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
});

process.on('SIGTERM', () => {
  logger.info('🛑 SIGTERM received');
  process.emit('SIGINT' as any);
});

/**
 * Unhandled rejection handler
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', { promise, reason });
});

/**
 * Main application
 */
async function main(): Promise<void> {
  try {
    logger.info('');
    logger.info('╔════════════════════════════════════════════════════════╗');
    logger.info('║   🚀 TikTok LIVE Automation Platform - Starting...     ║');
    logger.info('╚════════════════════════════════════════════════════════╝');
    logger.info('');

    // 1. Initialize database
    logger.info('📊 Step 1: Initializing database...');
    await initializeDatabase();
    logger.info('✅ Database initialized');

    // 2. Create Fastify server
    logger.info('🔧 Step 2: Creating API server...');
    const fastify = await createServer();
    logger.info('✅ API server created');

    // 3. Setup WebSocket
    logger.info('🔌 Step 3: Setting up WebSocket...');
    await setupWebSocket(fastify);
    logger.info('✅ WebSocket configured');

    // 4. Register API routes
    logger.info('📍 Step 4: Registering API routes...');
    await registerUserRoutes(fastify);
    await registerSettingsRoutes(fastify);
    await registerSessionRoutes(fastify);
    logger.info('✅ All routes registered');

    // 5. Setup cron jobs
    logger.info('⏰ Step 5: Setting up cron jobs...');

    // Cleanup expired reservations every minute
    cron.schedule('* * * * *', async () => {
      try {
        const cleaned = await cleanupExpiredReservations();
        if (cleaned > 0) {
          logger.info(`🧹 Cleaned up ${cleaned} expired reservations`);
        }
      } catch (error) {
        logger.error('Reservation cleanup error', { error });
      }
    });

    // Check and log active sessions every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        const stats = sessionManager.getStats();
        if (stats.activeSessionsCount > 0) {
          logger.info(`📊 Active sessions: ${stats.activeSessionsCount}`, {
            userIds: stats.userIds,
          });
        }
      } catch (error) {
        logger.error('Session stats error', { error });
      }
    });

    // Cleanup old sessions every day at midnight
    cron.schedule('0 0 * * *', async () => {
      try {
        logger.info('🧹 Running daily cleanup...');
        // Could implement cleanup of old sessions here
        logger.info('✅ Daily cleanup completed');
      } catch (error) {
        logger.error('Daily cleanup error', { error });
      }
    });

    logger.info('✅ Cron jobs configured');

    // 6. Start API server
    logger.info('🚀 Step 6: Starting API server...');
    const port = parseInt(process.env.API_PORT || '3000');
    await startServer(fastify, port);

    logger.info('');
    logger.info('╔════════════════════════════════════════════════════════╗');
    logger.info('║   ✅ Platform Started Successfully!                    ║');
    logger.info('╠════════════════════════════════════════════════════════╣');
    logger.info(`║   🌐 API: http://localhost:${port}                     ║`);
    logger.info('║   💻 Admin: http://localhost:3001                      ║');
    logger.info('║   🔌 WebSocket: ws://localhost:3000/api/...            ║');
    logger.info('╠════════════════════════════════════════════════════════╣');
    logger.info('║   📊 Ready to serve multiple TikTok LIVE sellers!      ║');
    logger.info('║   🎬 Start a session from admin panel                  ║');
    logger.info('╚════════════════════════════════════════════════════════╝');
    logger.info('');

    // Log startup completion
    logger.info('✨ All systems operational');
  } catch (error) {
    logger.error('💥 Fatal error during startup', { error });
    process.exit(1);
  }
}

// Run main
main();
