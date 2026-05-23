// src/telegram/telegram.instance.ts - FIXED

import { Telegraf, Context, Markup } from 'telegraf';
import { logger } from '../logger.js';
import { sessionManager } from '../sessions/sessions.manager.js';
import type { UserSettings } from '../core/types.js';
import * as ordersService from '../orders.js';
import * as reservationsService from '../reservations.js';
import { getNovaPoshtaClient } from '../novaposhta.js';

interface BotSession {
  reservationId?: number;
  orderId?: number;
  step?: string;
  customerName?: string;
  phone?: string;
  city?: string;
  cityRef?: string;
  branch?: string;
  branchRef?: string;
}

interface BotContext extends Context {
  session?: BotSession;
}

export class TelegramInstance {
  private bot: Telegraf<BotContext>;
  private userId: number;
  private settings: UserSettings;
  private botInfo: any;

  constructor(userId: number, settings: UserSettings) {
    this.userId = userId;
    this.settings = settings;
    this.bot = new Telegraf<BotContext>(settings.telegram_bot_token!);
    this.setupHandlers();
  }

  /**
   * Setup command and message handlers
   */
  private setupHandlers(): void {
    // Start command
    this.bot.start(async (ctx) => {
      try {
        if (!ctx.from?.id) return;

        await sessionManager.addLog(
          this.userId,
          'telegram_message',
          `New user started bot: @${ctx.from?.username || ctx.from?.id}`,
          { userId: ctx.from?.id, username: ctx.from?.username }
        );

        const message = `
👋 Welcome to our shop!

🎬 **Reserve items from TikTok LIVE here**

To get started:
1. Watch our TikTok LIVE stream
2. See an item you like?
3. Send the order code in the LIVE chat
4. Complete your order details here

Let's go! 🛍️
`;

        await ctx.reply(message, {
          parse_mode: 'HTML',
        });
      } catch (error) {
        logger.error('Error in start handler', { error, userId: this.userId });
      }
    });

    // Help command
    this.bot.help(async (ctx) => {
      const message = `
📚 **Help**

Available commands:
/start - Start the bot
/help - Show this message
/status - Check your order status

Just follow the prompts to complete your order!
`;

      await ctx.reply(message, {
        parse_mode: 'HTML',
      });
    });

    // Text messages (order flow)
    this.bot.on('text', async (ctx) => {
      try {
        if (!ctx.session) {
          ctx.session = {};
        }

        const userId = ctx.from?.id;
        const text = ctx.message.text;

        // Log message
        await sessionManager.addLog(
          this.userId,
          'telegram_message',
          `Message from @${ctx.from?.username || userId}: ${text}`,
          { telegramUserId: userId, username: ctx.from?.username }
        );

        // Handle based on current step
        const step = ctx.session.step;

        if (!step) {
          // Not in order flow - show welcome
          await ctx.reply(
            '👋 Send /start to begin, or watch TikTok LIVE and reserve an item!'
          );
          return;
        }

        // Order flow steps
        switch (step) {
          case 'waiting_name':
            ctx.session.customerName = text;
            ctx.session.step = 'waiting_phone';
            await ctx.reply('📞 What\'s your phone number?\n\nExample: +380671234567');
            break;

          case 'waiting_phone':
            ctx.session.phone = text;
            ctx.session.step = 'waiting_city';

            // Get cities from Nova Poshta
            const cities = await this.getNovaPoshtaCities();
            if (cities.length > 0) {
              const keyboard = Markup.inlineKeyboard(
                cities.slice(0, 10).map((city: any) =>
                  Markup.button.callback(city.Description, `city_${city.Ref}`)
                )
              );
              await ctx.reply('🏙️ Select your city:', keyboard);
            }
            break;

          default:
            await ctx.reply('👋 Not sure what to do. Send /start to begin!');
        }
      } catch (error) {
        logger.error('Error handling text message', { error, userId: this.userId });
        await ctx.reply('❌ Something went wrong. Please try again.');
      }
    });

    // Callback queries (button clicks)
    this.bot.on('callback_query', async (ctx) => {
      try {
        const data = (ctx.callbackQuery as any)?.data as string | undefined;

        if (!data) {
          await ctx.answerCbQuery('❌ Error');
          return;
        }

        if (!ctx.session) {
          ctx.session = {};
        }

        if (data.startsWith('city_')) {
          const cityRef = data.replace('city_', '');
          ctx.session.cityRef = cityRef;
          ctx.session.step = 'waiting_branch';

          // Get branches
          const branches = await this.getNovaPoshtaBranches(cityRef);
          if (branches.length > 0) {
            const keyboard = Markup.inlineKeyboard(
              branches.slice(0, 10).map((branch: any) =>
                Markup.button.callback(branch.Description, `branch_${branch.Ref}`)
              )
            );
            await ctx.editMessageText('🏢 Select delivery branch:', keyboard);
          }

          await ctx.answerCbQuery();
        } else if (data.startsWith('branch_')) {
          const branchRef = data.replace('branch_', '');
          ctx.session.branchRef = branchRef;
          ctx.session.step = 'confirming';

          await ctx.editMessageText('✅ Branch selected!');
          await ctx.answerCbQuery();

          // Complete order
          await this.completeOrder(ctx);
        }
      } catch (error) {
        logger.error('Error handling callback', { error, userId: this.userId });
        await ctx.answerCbQuery('❌ Error');
      }
    });

    // Error handler
    this.bot.catch((error) => {
      logger.error(`Telegram bot error for user ${this.userId}`, { error });
    });
  }

  /**
   * Get Nova Poshta cities
   */
  private async getNovaPoshtaCities(): Promise<any[]> {
    try {
      const np = getNovaPoshtaClient();
      return await np.getCities();
    } catch (error) {
      logger.error('Error getting cities', { error, userId: this.userId });
      return [];
    }
  }

  /**
   * Get Nova Poshta branches
   */
  private async getNovaPoshtaBranches(cityRef: string): Promise<any[]> {
    try {
      const np = getNovaPoshtaClient();
      return await np.getBranches(cityRef);
    } catch (error) {
      logger.error('Error getting branches', { error, userId: this.userId });
      return [];
    }
  }

  /**
   * Complete order
   */
  private async completeOrder(ctx: BotContext): Promise<void> {
    if (!ctx.session?.reservationId) {
      await ctx.reply('❌ No reservation found');
      return;
    }

    try {
      // Convert reservation to order
      const orderId = await reservationsService.reservationToOrder(
        ctx.session.reservationId,
        ctx.from?.id || 0
      );

      if (!orderId) {
        await ctx.reply('❌ Reservation expired. Try again!');
        return;
      }

      // Update order with details
      await ordersService.updateOrderDetails(orderId, {
        customerName: ctx.session.customerName,
        phone: ctx.session.phone,
        city: ctx.session.city,
        novaPoshtaBranch: ctx.session.branch,
      });

      // Confirm payment
      await ordersService.confirmPayment(orderId);

      // Log success
      await sessionManager.addLog(
        this.userId,
        'order',
        `Order #${orderId} created - ${ctx.session.customerName}`,
        {
          orderId,
          customerName: ctx.session.customerName,
          phone: ctx.session.phone,
        }
      );

      // Send confirmation
      const message = `
✅ **Order Created!**

📦 Order #${orderId}
👤 Name: ${ctx.session.customerName}
📞 Phone: ${ctx.session.phone}
🏢 Branch: ${ctx.session.branch}

We'll contact you soon with payment details!
`;

      await ctx.reply(message, {
        parse_mode: 'HTML',
      });

      // Notify admin
      if (this.settings.telegram_channel_id) {
        const adminMessage = `
🎉 **New Order!**

📦 Order #${orderId}
👤 ${ctx.session.customerName}
📞 ${ctx.session.phone}
🏢 ${ctx.session.branch}
`;

        try {
          const channelId = String(this.settings.telegram_channel_id);
          await this.bot.telegram.sendMessage(channelId, adminMessage, {
            parse_mode: 'HTML',
          });
        } catch (error) {
          logger.error('Error sending admin notification', { error });
        }
      }

      // Reset session
      ctx.session = {};
    } catch (error) {
      logger.error('Error completing order', { error, userId: this.userId });
      await ctx.reply('❌ Error creating order. Please try again!');
    }
  }

  /**
   * Start bot
   */
  async start(): Promise<void> {
    try {
      this.botInfo = await this.bot.telegram.getMe();

      await this.bot.launch();

      logger.info(`✅ Telegram bot started for user ${this.userId}`);

      await sessionManager.addLog(
        this.userId,
        'info',
        `Telegram bot started (@${this.botInfo.username})`
      );
    } catch (error) {
      logger.error(`Failed to start Telegram bot for user ${this.userId}`, { error });
      throw error;
    }
  }

  /**
   * Stop bot
   */
  async stop(): Promise<void> {
    try {
      await this.bot.stop();

      logger.info(`✅ Telegram bot stopped for user ${this.userId}`);

      await sessionManager.addLog(this.userId, 'info', 'Telegram bot stopped');
    } catch (error) {
      logger.error(`Error stopping Telegram bot for user ${this.userId}`, { error });
    }
  }

  /**
   * Send message to user
   */
  async sendMessage(chatId: number | string, text: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(String(chatId), text, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      logger.error(`Failed to send message for user ${this.userId}`, { error });
    }
  }

  /**
   * Send notification to admin channel
   */
  async notifyAdmin(message: string): Promise<void> {
    if (!this.settings.telegram_channel_id) return;

    try {
      const channelId = String(this.settings.telegram_channel_id);
      await this.bot.telegram.sendMessage(channelId, message, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      logger.error(`Failed to send admin notification for user ${this.userId}`, { error });
    }
  }
}
