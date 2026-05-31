// src/tiktok/tiktok.instance.ts

import { EventEmitter } from 'events';
import { parseOrder, validateOrder } from '../parser.js';
import { createReservation } from '../reservations.js';
import { logger } from '../logger.js';
import { sessionManager } from '../sessions/sessions.manager.js';
import type { UserSettings } from '../core/types.js';
import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';

export class TikTokInstance extends EventEmitter {
  private connection: any = null;
  private userId: number;
  private settings: UserSettings;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  private userComments: Map<string, number> = new Map();
  private commentRateLimit = 1000; // 1 second between same user

  constructor(userId: number, settings: UserSettings) {
    super();
    this.userId = userId;
    this.settings = settings;
  }

  /**
   * Connect to TikTok LIVE
   */
  async connect(): Promise<void> {
    try {
      logger.info(`🎬 Connecting to TikTok LIVE for user ${this.userId}... ${this.settings.tiktok_username!}...`);
      this.connection = new TikTokLiveConnection(this.settings.tiktok_username!, {
        // CRITICAL: Skip initial data to avoid 403 errors from TikTok
        processInitialData: false,
        enableExtendedGiftInfo: false,
      });

      // Chat events
      this.connection.on(WebcastEvent.CHAT, async (data: any) => {
        try {
          await this.handleComment(data);
        } catch (error) {
          logger.error(`Error handling comment for user ${this.userId}`, { error });
        }
      });

      /*
      
      // Member join event
      this.connection.on('member', async (data: any) => {
        try {
          await sessionManager.addLog(
            this.userId,
            'info',
            `New member joined: ${data.uniqueId}`,
            { memberName: data.uniqueId }
          );
        } catch (error) {
          logger.error('Error logging member join', { error });
        }
      });

      // Gift event
      this.connection.on('gift', async (data: any) => {
        try {
          await sessionManager.addLog(
            this.userId,
            'info',
            `Gift from ${data.uniqueId}: ${data.giftName}`,
            { from: data.uniqueId, gift: data.giftName }
          );
        } catch (error) {
          logger.error('Error logging gift', { error });
        }
      });
     
      */

      // Disconnect event
      this.connection.on('disconnect', () => {
        logger.warn(`TikTok disconnected for user ${this.userId}`);
        this.isConnected = false;
        this.handleDisconnect();
      });

      // Error event
      this.connection.on('error', (error: any) => {
        logger.error(`TikTok error for user ${this.userId}`, { error });
        // Don't disconnect on error - try to continue
      });

      // Connect
      await this.connection.connect();
      this.isConnected = true;
      this.reconnectAttempts = 0;

      logger.info(`✅ Connected to TikTok LIVE for user ${this.userId}`);

      await sessionManager.addLog(
        this.userId,
        'info',
        `Connected to TikTok LIVE @${this.settings.tiktok_username}`
      );

      this.emit('connected');
    } catch (error) {
      logger.error(`Failed to connect to TikTok for user ${this.userId}`, { error });
      
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'object'
            ? JSON.stringify(error)
            : String(error);

      await sessionManager.addLog(
        this.userId,
        'error',
        `Failed to connect to TikTok LIVE: ${errorMessage}`
      );

      this.handleDisconnect();
    }
  }

  /**
   * Handle incoming comment
   */
  private async handleComment(data: any): Promise<void> {
    try {
      const uniqueId = data.user?.displayId || data.user?.nickname;
      const comment = data.content;
  
      logger.info(`🎬 Comment from ${uniqueId}: ${comment}`);
      
      if (!uniqueId || !comment) {
        return;
      }

      // Parse order from comment
      const parsed = parseOrder(comment);
      if (!parsed || !validateOrder(parsed)) {
        return;
      }

      // Rate limiting per user
      const now = Date.now();
      const lastCommentTime = this.userComments.get(uniqueId) || 0;
      if (now - lastCommentTime < this.commentRateLimit) {
        return;
      }
      this.userComments.set(uniqueId, now);

      logger.info(
        `📝 Order detected for user ${this.userId}: ${parsed.productCode} ${parsed.size}`,
        { tiktokUser: uniqueId }
      );

      try {
        // Create reservation
        const reservation = await createReservation(
          this.userId.toString(),
          parsed.productCode,
          parsed.size,
          uniqueId
        );

        if (reservation) {
          logger.info(`✅ Reservation created for user ${this.userId}`, {
            reservationId: reservation.id,
          });

          // Log to session
          await sessionManager.addLog(
            this.userId,
            'tiktok_comment',
            `Order: ${parsed.productCode} ${parsed.size} from @${uniqueId}`,
            {
              productCode: parsed.productCode,
              size: parsed.size,
              tiktokUser: uniqueId,
            }
          );

          this.emit('orderDetected', {
            userId: this.userId,
            order: parsed,
            nickname: uniqueId,
            reservation,
          });
        }
      } catch (error) {
        logger.error('Error creating reservation', { error, userId: this.userId });
        await sessionManager.addLog(
          this.userId,
          'error',
          `Failed to create reservation: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    } catch (error) {
      logger.error('Error in handleComment', { error, userId: this.userId });
    }
  }

  /**
   * Handle disconnection with reconnect
   */
  private async handleDisconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`Max reconnection attempts for user ${this.userId} reached`);

      await sessionManager.addLog(
        this.userId,
        'error',
        `Max reconnection attempts (${this.maxReconnectAttempts}) reached`
      );

      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    const delaySeconds = Math.round(delay / 1000);

    logger.warn(
      `🔄 Reconnecting TikTok for user ${this.userId} in ${delaySeconds}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    await sessionManager.addLog(
      this.userId,
      'info',
      `Reconnecting in ${delaySeconds}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      this.connect().catch((error) => {
        logger.error('Reconnect error', { error, userId: this.userId });
      });
    }, delay);
  }

  /**
   * Disconnect gracefully
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.disconnect();
        this.isConnected = false;

        logger.info(`✅ TikTok disconnected for user ${this.userId}`);

        await sessionManager.addLog(this.userId, 'info', 'Disconnected from TikTok LIVE');
      } catch (error) {
        logger.error(`Error disconnecting TikTok for user ${this.userId}`, { error });
      }
    }
  }

  /**
   * Get connection stats
   */
  getStats(): {
    connected: boolean;
    reconnectAttempts: number;
    username?: string;
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      username: this.settings.tiktok_username,
    };
  }

  /**
   * Check if connected
   */
  isLive(): boolean {
    return this.isConnected;
  }
}
