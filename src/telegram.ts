import { Telegraf, Context } from 'telegraf';
import { logger } from './logger.js';
import {
  // createReservation,
  // getUserReservations,
  reservationToOrder,
} from './reservations.js';
import {
  updateOrderDetails,
  // getOrder,
  confirmPayment,
  addTrackingNumber,
} from './orders.js';
import { getNovaPoshtaClient } from './novaposhta.js';
import { pool } from './db.js';

interface SessionData {
  reservationId?: number;
  orderId?: number;
  step?: string;
  customerName?: string;
  phone?: string;
  city?: string;
  cityRef?: string;
  branch?: string;
  branchRef?: string;
  tiktokNickname?: string;
}

interface BotContext extends Context {
  session?: SessionData;
}

const bot = new Telegraf<BotContext>(process.env.TELEGRAM_BOT_TOKEN || '');

// Session middleware
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  try {
    const result = await pool.query(
      `SELECT * FROM telegram_users WHERE telegram_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      await pool.query(
        `INSERT INTO telegram_users (telegram_id, username, first_name, last_name)
         VALUES ($1, $2, $3, $4)`,
        [userId, ctx.from?.username, ctx.from?.first_name, ctx.from?.last_name]
      );
    }

    // Simple session data
    if (!ctx.session) {
      ctx.session = {};
    }
  } catch (error) {
    logger.error('Session setup error', { error });
  }

  return next();
});

/**
 * START command - Welcome
 */
bot.start(async (ctx) => {
  const message = `
👋 Добро пожаловать в наш магазин детской одежды!

🛍️ Здесь вы можете:
• Завершить заказ из TikTok LIVE
• Отследить доставку
• Получить поддержку

📱 Оборотитесь к боту, когда вы зарезервируете товар в LIVE.
`;

  await ctx.reply(message, {
    parse_mode: 'HTML',
  });
});

/**
 * Handle reservation confirmation from TikTok LIVE
 */
bot.command('confirm_reservation', async (ctx) => {
  try {
    // Parse reservation ID from args: /confirm_reservation_123
    const args = ctx.message.text.split('_');
    const reservationId = parseInt(args[args.length - 1]);

    if (!reservationId) {
      await ctx.reply('❌ Invalid reservation ID');
      return;
    }

    // Store in session
    if (!ctx.session) ctx.session = {};
    ctx.session.reservationId = reservationId;
    ctx.session.step = 'confirming_reservation';

    const message = `
✅ Отлично! Давайте завершим ваш заказ.

📝 Введите ваше имя:
`;

    await ctx.reply(message);
  } catch (error) {
    logger.error('Error in confirm_reservation', { error });
    await ctx.reply('❌ Ошибка при обработке резервирования');
  }
});

/**
 * Handle text messages for order flow
 */
bot.on('text', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  const step = ctx.session.step;

  try {
    switch (step) {
      case 'confirming_reservation':
        // Get customer name
        ctx.session.customerName = ctx.message.text.trim();
        ctx.session.step = 'waiting_phone';
        await ctx.reply('📞 Введите ваш номер телефона (например: +380671234567):');
        break;

      case 'waiting_phone':
        // Get phone
        ctx.session.phone = ctx.message.text.trim();
        ctx.session.step = 'waiting_city';

        // Get cities from Nova Poshta
        const np = getNovaPoshtaClient();
        const cities = await np.getCities();

        if (cities.length === 0) {
          await ctx.reply('❌ Не удалось загрузить список городов. Попробуйте позже.');
          return;
        }

        // Show first 10 cities as inline buttons
        const keyboard = cities.slice(0, 10).map((city: any) => [
          {
            text: city.Description,
            callback_data: `city_${city.Ref}`,
          },
        ]);

        await ctx.reply('🏙️ Выберите город доставки:', {
          reply_markup: {
            inline_keyboard: keyboard,
          },
        });
        break;

      case 'waiting_branch':
        // If user types instead of selecting - try to find branch
        ctx.session.branch = ctx.message.text.trim();
        ctx.session.step = 'confirming_order';
        await ctx.reply(
          '✅ Спасибо! Давайте подтвердим ваш заказ...'
        );
        await completeOrder(ctx);
        break;

      default:
        // User sent message without active order flow
        await ctx.reply(
          '👋 Привет! Зарезервируйте товар в нашем TikTok LIVE, и мы поможем вам завершить заказ.'
        );
    }
  } catch (error) {
    logger.error('Error handling message', { error, step });
    await ctx.reply('❌ Произошла ошибка. Попробуйте снова.');
  }
});

/**
 * Handle inline button clicks (city selection, branch selection)
 */
bot.on('callback_query', async (ctx) => {
  if (!ctx.session) ctx.session = {};

  try {
    const data = (ctx.callbackQuery as any)?.data;
    
    if (!data) {
      await ctx.answerCbQuery('❌ Помилка');
      return;
    }

    if (data.startsWith('city_')) {
      // City selected
      const cityRef = data.replace('city_', '');
      ctx.session.city = ctx.callbackQuery.from.id.toString();
      ctx.session.cityRef = cityRef;
      ctx.session.step = 'waiting_branch';

      // Get branches for selected city
      const np = getNovaPoshtaClient();
      const branches = await np.getBranches(cityRef);

      if (branches.length === 0) {
        await ctx.answerCbQuery('❌ Не найдено отделений в этом городе');
        return;
      }

      // Show first 10 branches
      const keyboard = branches.slice(0, 10).map((branch: any) => [
        {
          text: branch.Description,
          callback_data: `branch_${branch.Ref}`,
        },
      ]);

      // Edit message
      await ctx.editMessageText('🏢 Выберите отделение Nova Poshta:', {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });

      await ctx.answerCbQuery();
    } else if (data.startsWith('branch_')) {
      // Branch selected
      const branchRef = data.replace('branch_', '');
      ctx.session.branchRef = branchRef;
      ctx.session.branch = branchRef;
      ctx.session.step = 'confirming_order';

      await ctx.editMessageText('✅ Отделение выбрано. Завершаем заказ...');
      await ctx.answerCbQuery();

      // Complete the order
      await completeOrder(ctx);
    }
  } catch (error) {
    logger.error('Error handling callback', { error });
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});

/**
 * Complete order and send to admin
 */
async function completeOrder(ctx: BotContext): Promise<void> {
  if (!ctx.session?.reservationId) {
    await ctx.reply('❌ Резервирование не найдено');
    return;
  }

  try {
    // Convert reservation to order
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('❌ Ошибка идентификации');
      return;
    }

    const orderId = await reservationToOrder(ctx.session.reservationId, userId);

    if (!orderId) {
      await ctx.reply('❌ Резервирование истекло. Попробуйте снова.');
      return;
    }

    // Update order with customer details
    await updateOrderDetails(orderId, {
      customerName: ctx.session.customerName,
      phone: ctx.session.phone,
      city: ctx.session.city,
      novaPoshtaBranch: ctx.session.branch,
    });

    // Confirm payment (change to waiting_payment if needed)
    await confirmPayment(orderId);

    ctx.session.orderId = orderId;

    const successMessage = `
✅ **Заказ создан!**

📦 Номер заказа: #${orderId}
👤 Имя: ${ctx.session.customerName}
📞 Телефон: ${ctx.session.phone}
🏢 Отделение: ${ctx.session.branch}

📋 Ожидается подтверждение оплаты и генерация номера для отслеживания.

💬 Мы свяжемся с вами в ближайшее время!
`;

    await ctx.reply(successMessage, {
      parse_mode: 'HTML',
    });

    // Notify admin about new order
    const channelId = process.env.TELEGRAM_CHANNEL_ID;
    if (channelId) {
      const adminMessage = `
🎉 **Новый заказ!**

📦 Товар: ${ctx.session.customerName}
👤 Клиент: ${ctx.session.customerName}
📞 Телефон: ${ctx.session.phone}
🏢 Отделение: ${ctx.session.branch}
📱 Telegram ID: ${userId}
`;

      await bot.telegram.sendMessage(channelId, adminMessage, {
        parse_mode: 'HTML',
      });
    }

    // Reset session
    ctx.session = {};
  } catch (error) {
    logger.error('Error completing order', { error });
    await ctx.reply('❌ Ошибка при создании заказа. Попробуйте снова.');
  }
}

/**
 * Admin command: Send tracking number
 */
bot.command('send_tracking', async (ctx) => {
  try {
    // Format: /send_tracking <userId> <orderId> <trackingNumber>
    const args = ctx.message.text.split(' ');

    if (args.length < 4) {
      await ctx.reply('Usage: /send_tracking <userId> <orderId> <trackingNumber>');
      return;
    }

    const userId = parseInt(args[1]);
    const orderId = parseInt(args[2]);
    const trackingNumber = args[3];

    // Update order
    const order = await addTrackingNumber(orderId, trackingNumber);

    if (!order) {
      await ctx.reply('❌ Order not found');
      return;
    }

    // Send to customer
    const message = `
📦 **Ваш номер отслеживания готов!**

🎫 Номер: ${trackingNumber}
📍 Отслеживать: https://tracking.novaposhta.ua

⏱️ Посылка будет отправлена в течение 24 часов.
`;

    await bot.telegram.sendMessage(userId, message, {
      parse_mode: 'HTML',
    });

    await ctx.reply(`✅ Tracking number sent to user ${userId}`);
  } catch (error) {
    logger.error('Error sending tracking', { error });
    await ctx.reply('❌ Error sending tracking number');
  }
});

/**
 * Start polling
 */
export async function startTelegramBot(): Promise<void> {
  try {
    await bot.launch();
    logger.info('Telegram bot started');
  } catch (error) {
    logger.error('Failed to start Telegram bot', { error });
    throw error;
  }
}

/**
 * Stop polling
 */
export async function stopTelegramBot(): Promise<void> {
  try {
    await bot.stop();
    logger.info('Telegram bot stopped');
  } catch (error) {
    logger.error('Error stopping Telegram bot', { error });
  }
}

export { bot as telegramBot };
