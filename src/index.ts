// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

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
import { registerPosPlugin } from './pos/pos.plugin.js';
import { reconcileQrPayments } from './pos/qr.service.js';
import { runGtinEventsRetention } from './pos/gtin/events-retention.js';
import { closeDueShifts } from './pos/fiscal/shifts.service.js';
import { retryPendingFiscalDocs } from './pos/fiscal/fiscal.service.js';
import { refillAllStores } from './pos/fiscal/offline/pool.js';
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
    await registerPosPlugin(fastify);
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

    // Reconcile QR payments against the provider's transaction feed daily
    cron.schedule('15 3 * * *', async () => {
      try {
        await reconcileQrPayments();
      } catch (error) {
        logger.error('QR reconcile cron error', { error });
      }
    });

    // Trim GTIN lookup history — a row per source per scan, read only for the
    // last 24 hours. Owner corrections and evictions are kept.
    cron.schedule('30 3 * * *', async () => {
      try {
        await runGtinEventsRetention();
      } catch (error) {
        logger.error('GTIN events retention cron error', { error });
      }
    });

    // Close ПРРО shifts before they hit the 24h legal limit. Every 5 minutes,
    // because the deadline is real: a shift that overruns is a compliance
    // problem, not a cosmetic one. A no-op for stores without fiscalisation.
    cron.schedule('*/5 * * * *', async () => {
      try {
        const { closed, failed } = await closeDueShifts();
        if (closed > 0 || failed > 0) {
          logger.info(`🧾 Fiscal shifts auto-closed: ${closed}, failed: ${failed}`);
        }
      } catch (error) {
        logger.error('Fiscal shift auto-close cron error', { error });
      }
    });

    // Retry fiscal documents that did not go through, and run the housekeeping
    // sweeps (voided sales, orphans, stale rows). Self-guarded against
    // overlapping ticks. A no-op for stores without fiscalisation.
    cron.schedule('*/2 * * * *', async () => {
      try {
        const result = await retryPendingFiscalDocs();
        if (result.done > 0 || result.failed > 0 || result.abandoned > 0) {
          logger.info(
            `🧾 Fiscal retry: ${result.done} done, ${result.failed} failed, ` +
              `${result.abandoned} abandoned, ${result.adopted} adopted`
          );
        }
      } catch (error) {
        logger.error('Fiscal retry cron error', { error });
      }
    });

    // Keep the pool of tax-office offline codes topped up for stores that run
    // ПРРО in offline mode (TechDocs/POS_FISCAL_OFFLINE.md §3). Only works
    // while the provider is online, which is exactly when nobody needs the
    // codes — hence a cron, not a checkout-time call. A no-op otherwise.
    cron.schedule('*/10 * * * *', async () => {
      try {
        const result = await refillAllStores();
        if (result.fetched > 0 || result.burned > 0 || result.failed > 0) {
          logger.info(
            `🧾 Fiscal offline codes: ${result.fetched} fetched, ${result.burned} burned, ` +
              `${result.failed} failed across ${result.stores} stores`
          );
        }
      } catch (error) {
        logger.error('Fiscal offline codes refill cron error', { error });
      }
    });

    logger.info('✅ Cron jobs configured');

    // 6. Start API server
    logger.info('🚀 Step 6: Starting API server...');
    const port = parseInt(process.env.API_PORT || '3000');
    await startServer(fastify, port);

    logger.info('');
    logger.info('╔═════════════════════════════════════════════════════════════════╗');
    logger.info('║   ✅ Platform Started Successfully!                             ║');
    logger.info('╠═════════════════════════════════════════════════════════════════╣');
    logger.info(`║   🌐 API: http://localhost:${port}                              ║`);
    logger.info('║   💻 LIVE Admin: http://localhost:3001                          ║');
    logger.info('║   🛍️  POS: http://localhost:3002                               ║');
    logger.info(`║   🔌 WebSocket: ws://localhost:${port}/api/sessions/logs/stream ║`);
    logger.info('╠═════════════════════════════════════════════════════════════════╣');
    logger.info('║   📊 LIVE + POS API ready                                       ║');
    logger.info('║   🎬 LIVE sessions: admin panel | POS: /api/pos                 ║');
    logger.info('╚═════════════════════════════════════════════════════════════════╝');
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
