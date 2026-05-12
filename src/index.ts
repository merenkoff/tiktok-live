import 'dotenv/config';
import cron from 'node-cron';
import { logger } from './logger.js';
import { initializeDatabase } from './db.js';
import { getTikTokManager } from './tiktok.js';
import { startTelegramBot } from './telegram.js';
import { startServer } from './api.js';
import { cleanupExpiredReservations } from './reservations.js';

/**
 * Setup scheduled tasks
 */
function setupCronJobs(): void {
  // Clean up expired reservations every minute
  cron.schedule('* * * * *', async () => {
    try {
      await cleanupExpiredReservations();
    } catch (error) {
      logger.error('Cron job error: cleanup expired reservations', { error });
    }
  });

  logger.info('Cron jobs scheduled');
}

/**
 * Graceful shutdown
 */
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');

  try {
    const tiktok = await getTikTokManager();
    await tiktok.disconnect();
    logger.info('TikTok connection closed');
  } catch (error) {
    logger.error('Error closing TikTok connection', { error });
  }

  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');

  try {
    const tiktok = await getTikTokManager();
    await tiktok.disconnect();
  } catch (error) {
    logger.error('Error closing TikTok connection', { error });
  }

  process.exit(0);
});

/**
 * Main application
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting TikTok LIVE Sales Automation...');

    // Initialize database
    logger.info('Initializing database...');
    await initializeDatabase();

    // Start API server
    const port = parseInt(process.env.API_PORT || '3000');
    logger.info(`Starting API server on port ${port}...`);
    await startServer(port);

    // Start Telegram bot
    logger.info('Starting Telegram bot...');
    await startTelegramBot();

    // Setup cron jobs
    setupCronJobs();

    // Connect to TikTok LIVE
    logger.info('Connecting to TikTok LIVE...');
    const tiktok = await getTikTokManager();

    // Setup event listeners
    tiktok.on('connected', () => {
      logger.info('✅ Connected to TikTok LIVE and ready to receive orders');
    });

    tiktok.on('liveEnded', () => {
      logger.warn('TikTok LIVE stream ended');
    });

    tiktok.on('maxReconnectAttemptsReached', () => {
      logger.error('Max reconnection attempts reached. Manual intervention needed.');
    });

    tiktok.on('orderDetected', (data) => {
      logger.info('Order detected!', data);
    });

    // Connect
    await tiktok.connect();

    logger.info('🚀 Application started successfully!');
    logger.info('Environment:');
    logger.info(`  - TikTok: @${process.env.TIKTOK_USERNAME}`);
    logger.info(`  - API: http://localhost:${port}`);
    logger.info(`  - Telegram: Bot connected and listening`);
  } catch (error) {
    logger.error('Fatal error during startup', { error });
    process.exit(1);
  }
}

main();
