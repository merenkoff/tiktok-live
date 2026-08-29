// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/sessions/sessions.startup.ts

import { logger } from '../logger.js';
import { sessionManager } from './sessions.manager.js';
import { TikTokInstance } from '../tiktok/tiktok.instance.js';
import { TelegramInstance } from '../telegram/telegram.instance.js';
// import * as usersService from '../users/users.service.js';

/**
 * Start a complete user session with TikTok + Telegram
 */
export async function startUserSession(userId: number): Promise<void> {
  try {
    logger.info(`🚀 Starting complete session for user ${userId}...`);

    // 1. Load user data and initialize session
    const activeSession = await sessionManager.startSession(userId);

    logger.info(`✅ Session initialized for user ${userId}`, {
      sessionId: activeSession.session.id,
    });

    // 2. Initialize and connect TikTok
    try {
      logger.info(`🎬 Initializing TikTok for user ${userId}...`);

      const tiktokInstance = new TikTokInstance(userId, activeSession.settings);

      // Set in manager
      sessionManager.setTikTokManager(userId, tiktokInstance);

      // Connect to TikTok LIVE
      await tiktokInstance.connect();

      logger.info(`✅ TikTok connected for user ${userId}`);

      /*
      // Listen for order events
      tiktokInstance.on('orderDetected', async (event) => {
        logger.info('Order detected from TikTok', {
          userId,
          product: event.order.productCode,
          size: event.order.size,
          nickname: event.nickname,
        });
      });

      tiktokInstance.on('maxReconnectAttemptsReached', async () => {
        logger.warn(`TikTok max reconnect attempts reached for user ${userId}`);
        await sessionManager.addLog(
          userId,
          'error',
          '🔴 TikTok max reconnection attempts reached. Please restart the session.'
        );
      });
      */
     
    } catch (error) {
      logger.error(`Failed to start TikTok for user ${userId}`, { error });
      await sessionManager.addLog(
        userId,
        'error',
        `Failed to connect to TikTok: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw error;
    }

    // 3. Initialize and start Telegram bot
    try {
      logger.info(`🤖 Initializing Telegram bot for user ${userId}...`);

      const telegramInstance = new TelegramInstance(userId, activeSession.settings);

      // Set in manager
      sessionManager.setTelegramManager(userId, telegramInstance);

      // Start bot
      await telegramInstance.start();

      logger.info(`✅ Telegram bot started for user ${userId}`);
    } catch (error) {
      logger.error(`Failed to start Telegram bot for user ${userId}`, { error });
      await sessionManager.addLog(
        userId,
        'error',
        `Failed to start Telegram bot: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // 4. Log session start
    await sessionManager.addLog(
      userId,
      'info',
      `🎉 Session started for @${activeSession.settings.tiktok_username}`,
      {
        sessionId: activeSession.session.id,
        tiktokUsername: activeSession.settings.tiktok_username,
      }
    );

    logger.info(`✅✅✅ Complete session started for user ${userId}`);
  } catch (error) {
    logger.error(`Failed to start user session ${userId}`, { error });

    // Try to clean up
    try {
      await sessionManager.stopSession(userId);
    } catch (cleanupError) {
      logger.error(`Error during cleanup`, { cleanupError });
    }

    throw error;
  }
}

/**
 * Stop a complete user session
 */
export async function stopUserSession(userId: number): Promise<void> {
  try {
    logger.info(`🛑 Stopping session for user ${userId}...`);

    // Stop session manager (handles TikTok + Telegram shutdown)
    await sessionManager.stopSession(userId);

    logger.info(`✅ Session stopped for user ${userId}`);
  } catch (error) {
    logger.error(`Error stopping session for user ${userId}`, { error });
    throw error;
  }
}

/**
 * Restart a user session (stop then start)
 */
export async function restartUserSession(userId: number): Promise<void> {
  logger.info(`🔄 Restarting session for user ${userId}...`);

  try {
    await stopUserSession(userId);

    // Small delay before restart
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await startUserSession(userId);

    logger.info(`✅ Session restarted for user ${userId}`);
  } catch (error) {
    logger.error(`Error restarting session for user ${userId}`, { error });
    throw error;
  }
}

/**
 * Get session status for user
 */
export async function getUserSessionStatus(userId: number): Promise<{
  isActive: boolean;
  stats?: {
    tiktok: { connected: boolean; reconnectAttempts: number };
    session: { startedAt?: string; duration?: string };
  };
}> {
  const activeSession = sessionManager.getSession(userId);

  if (!activeSession) {
    return { isActive: false };
  }

  const duration = activeSession.session.started_at
    ? Math.floor((Date.now() - new Date(activeSession.session.started_at).getTime()) / 1000)
    : 0;

  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;

  const durationStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return {
    isActive: true,
    stats: {
      tiktok: activeSession.tiktokManager?.getStats() || {
        connected: false,
        reconnectAttempts: 0,
      },
      session: {
        startedAt: activeSession.session.started_at?.toString(),
        duration: durationStr,
      },
    },
  };
}
