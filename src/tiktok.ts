import { WebcastPushConnection } from 'tiktok-live-connector';
import { parseOrder, validateOrder } from './parser.js';
import { createReservation, getUserReservations } from './reservations.js';
import { telegramBot } from './telegram.js';
import { logger } from './logger.js';
import { EventEmitter } from 'events';

interface CommentEvent {
  uniqueId: string;
  comment: string;
  timestamp: number;
}

export class TikTokLiveManager extends EventEmitter {
  private connection: WebcastPushConnection | null = null;
  private tiktokUsername: string;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000; // 5 seconds
  private userComments: Map<string, number> = new Map(); // Track comment spam
  private commentRateLimit = 1000; // 1 second between orders from same user

  constructor(tiktokUsername: string) {
    super();
    this.tiktokUsername = tiktokUsername;
  }

  /**
   * Connect to TikTok LIVE and start listening
   */
  async connect(): Promise<void> {
    try {
      logger.info(`Connecting to TikTok LIVE: @${this.tiktokUsername}`);

      this.connection = new WebcastPushConnection(this.tiktokUsername);

      this.setupEventListeners();

      await this.connection.connect();
      this.isConnected = true;
      this.reconnectAttempts = 0;

      logger.info(`Connected to TikTok LIVE @${this.tiktokUsername}`);
      this.emit('connected');
    } catch (error) {
      logger.error(`Failed to connect to TikTok LIVE`, { error });
      this.handleDisconnect();
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    if (!this.connection) {
      return;
    }

    // Chat message
    this.connection.on('chat', async (data: any) => {
      try {
        await this.handleComment(data);
      } catch (error) {
        logger.error('Error handling comment', { error, data });
      }
    });

    // User joined
    this.connection.on('member', (data: any) => {
      logger.debug(`User joined: ${data.uniqueId}`);
    });

    // Gift received
    this.connection.on('gift', (data: any) => {
      logger.debug(`Gift received from ${data.uniqueId}`, { giftId: data.giftId });
    });

    // Viewer count update
    this.connection.on('viewerCount', (data: any) => {
      logger.debug(`Current viewers: ${data.viewerCount}`);
    });

    // LIVE ended
    this.connection.on('liveEnd', () => {
      logger.info('LIVE stream ended');
      this.isConnected = false;
      this.emit('liveEnded');
    });

    // Connection error
    this.connection.on('error', (error: Error) => {
      logger.error('TikTok connection error', { error });
      this.handleDisconnect();
    });

    // Disconnected
    this.connection.on('disconnect', () => {
      logger.warn('TikTok connection disconnected');
      this.isConnected = false;
      this.handleDisconnect();
    });
  }

  /**
   * Handle incoming comment
   */
  private async handleComment(data: any): Promise<void> {
    const { uniqueId, comment, createTime } = data;

    logger.debug(`Comment from ${uniqueId}: ${comment}`);

    // Spam prevention: check rate limit
    const now = Date.now();
    const lastCommentTime = this.userComments.get(uniqueId) || 0;

    if (now - lastCommentTime < this.commentRateLimit) {
      logger.debug(`Rate limit exceeded for ${uniqueId}`);
      return;
    }

    this.userComments.set(uniqueId, now);

    // Parse order from comment
    const parsed = parseOrder(comment);
    if (!parsed) {
      return;
    }

    // Validate order
    if (!validateOrder(parsed)) {
      logger.debug(`Invalid order format: ${comment}`);
      return;
    }

    logger.info(`Valid order detected: ${parsed.productCode} ${parsed.size}`, {
      user: uniqueId,
    });

    // Try to create reservation
    const reservation = await createReservation(
      parsed.productCode,
      parsed.size,
      uniqueId
    );

    if (!reservation) {
      logger.info(`Item already reserved: ${parsed.productCode} ${parsed.size}`);
      return;
    }

    logger.info(`Reservation created for ${uniqueId}`, {
      reservationId: reservation.id,
      productCode: parsed.productCode,
      size: parsed.size,
      expiresAt: reservation.expiresAt,
    });

    // Notify user on Telegram
    await this.sendReservationNotification(uniqueId, reservation);

    this.emit('orderDetected', {
      uniqueId,
      productCode: parsed.productCode,
      size: parsed.size,
      reservation,
    });
  }

  /**
   * Send reservation notification via Telegram
   */
  private async sendReservationNotification(
    tiktokNickname: string,
    reservation: any
  ): Promise<void> {
    try {
      const message = `
🎉 **Резервирование успешно!**

📦 Товар: ${reservation.productCode} (размер ${reservation.size})
⏰ Зарезервировано на: ${reservation.expiresAt.getMinutes() || 5} минут

👉 Перейти в Telegram для завершения заказа:
t.me/${process.env.TELEGRAM_BOT_TOKEN?.split(':')[0]}

⚠️ Если не завершить заказ в течение ${
        process.env.RESERVATION_TIMEOUT_MINUTES || 5
      } минут, товар будет доступен для других покупателей.
`;

      // Try to find user in Telegram
      const telegramUsers = await telegramBot.context.session?.find(
        (u: any) => u.tiktokNickname === tiktokNickname
      );

      if (telegramUsers) {
        // Send DM if we have their Telegram ID
        // This would need to be implemented based on your Telegram bot setup
        logger.info(`Would send Telegram notification to ${tiktokNickname}`);
      } else {
        logger.info(
          `No Telegram user found for ${tiktokNickname}, user needs to be in Telegram bot first`
        );
      }
    } catch (error) {
      logger.error('Failed to send reservation notification', { error });
    }
  }

  /**
   * Handle disconnection and attempt reconnect
   */
  private async handleDisconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(
        `Max reconnection attempts (${this.maxReconnectAttempts}) reached`
      );
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    const delaySeconds = Math.round(delay / 1000);

    logger.warn(
      `Reconnecting in ${delaySeconds}s... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Disconnect cleanly
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.disconnect();
        logger.info('Disconnected from TikTok LIVE');
      } catch (error) {
        logger.error('Error disconnecting from TikTok', { error });
      }
    }
    this.isConnected = false;
  }

  /**
   * Get connection status
   */
  isLiveConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get unique viewer count
   */
  getStats(): {
    connected: boolean;
    reconnectAttempts: number;
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

// Singleton instance
let tiktokManager: TikTokLiveManager | null = null;

export function getTikTokManager(): TikTokLiveManager {
  if (!tiktokManager) {
    const username = process.env.TIKTOK_USERNAME;
    if (!username) {
      throw new Error('TIKTOK_USERNAME not set');
    }
    tiktokManager = new TikTokLiveManager(username);
  }
  return tiktokManager;
}
