import Fastify, { FastifyInstance /*, FastifyRequest*/} from 'fastify';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { createLead, getLeads } from './leads.js';
import {
  getOrder,
  getOrdersByStatus,
  getOrdersByTiktok,
  getOrdersPendingPayment,
  // updateOrderStatus,
} from './orders.js';
import {
  getUserReservations,
  getReservation,
  cleanupExpiredReservations,
} from './reservations.js';
import { getTikTokManager } from './tiktok.js';
import { getNovaPoshtaClient } from './novaposhta.js';
// Multi-user imports
import * as usersService from './users/users.service.js';
// import * as sessionsService from './sessions/sessions.service.js';
import { sessionManager } from './sessions/sessions.manager.js';
import { loginUser, logoutUser, ensureAuth, /* verifyToken*/} from './core/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

//Double routes check here and in files like sessions.controller atc... and controllers // seems like controllers is the better aproch but now i cant cheak all of the routes. It wiil be fixed later
export async function createServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  /**
   * Auth middleware for protected routes
   */
  fastify.register(async (fastify) => {
    fastify.addHook('preHandler', async (request, reply) => {
      // Skip auth для публічних маршрутів
      const publicRoutes = ['/', '/about', '/health', '/api/leads', '/api/admin/leads', '/styles.css', '/app.js'];
      const path = request.url.split('?')[0];
      
      if (publicRoutes.includes(path)) {
        return;
      }

      // Перевірити токен
      try {
        ensureAuth(request);
      } catch (error) {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    });

    // ==================== AUTH ROUTES ====================

    /**
     * Login
     */
    fastify.post<{ Body: { tiktok_username: string } }>(
      '/api/auth/login',
      async (request, reply) => {
        try {
          const { tiktok_username } = request.body;
          
          if (!tiktok_username || tiktok_username.length < 3) {
            reply.status(400).send({ error: 'Invalid username' });
            return;
          }

          const { token, user } = await loginUser(tiktok_username);
          reply.send({ token, user });
        } catch (error) {
          logger.error('Login error', { error });
          reply.status(500).send({ error: 'Login failed' });
        }
      }
    );

    /**
     * Logout
     */
    fastify.post(
      '/api/auth/logout',
      async (request, reply) => {
        try {
          const token = request.headers.authorization?.substring(7);
          if (token) {
            logoutUser(token);
          }
          reply.send({ ok: true });
        } catch (error) {
          logger.error('Logout error', { error });
          reply.status(500).send({ error: 'Logout failed' });
        }
      }
    );

    /**
     * Get current user
     */
    fastify.get(
      '/api/auth/me',
      async (request, reply) => {
        try {
          const { userId } = ensureAuth(request);
          const user = await usersService.getUserById(userId);
          reply.send(user);
        } catch (error) {
          reply.status(401).send({ error: 'Unauthorized' });
        }
      }
    );

    // ==================== SETTINGS ROUTES ====================

    /**
     * Get user settings
     */
    fastify.get(
      '/api/settings',
      async (request, reply) => {
        try {
          const { userId } = ensureAuth(request);
          const settings = await usersService.getUserSettings(userId);
          
          if (!settings) {
            reply.status(404).send({ error: 'Settings not found' });
            return;
          }

          // Hide sensitive data
          const safe = { ...settings };
          if (safe.telegram_bot_token) {
            safe.telegram_bot_token = '***' as any;
          }
          if (safe.novaposhta_api_key) {
            safe.novaposhta_api_key = '***' as any;
          }

          reply.send(safe);
        } catch (error) {
          reply.status(401).send({ error: 'Unauthorized' });
        }
      }
    );

    /**
     * Save settings
     */
    fastify.put<{ Body: any }>(
      '/api/settings',
      async (request, reply) => {
        try {
          const { userId } = ensureAuth(request);
          
          const body = request.body as any;
          const settings = await usersService.saveUserSettings(userId, body);
          // Hide sensitive data in response
          const safe = { ...settings };
          if (safe.telegram_bot_token) {
            safe.telegram_bot_token = '***' as any;
          }
          if (safe.novaposhta_api_key) {
            safe.novaposhta_api_key = '***' as any;
          }

          reply.send(safe);
        } catch (error) {
          logger.error('Settings save error', { error });
          reply.status(500).send({ error: 'Failed to save settings' });
        }
      }
    );

    /**
     * Test Telegram
     */
    fastify.post(
      '/api/settings/test-telegram',
      async (request, reply) => {
        try {
          const { userId } = ensureAuth(request);
          const settings = await usersService.getUserSettings(userId);
          
          if (!settings?.telegram_bot_token) {
            reply.status(400).send({ error: 'Telegram token not set' });
            return;
          }

          const response = await fetch(
            `https://api.telegram.org/bot${settings.telegram_bot_token}/getMe`
          );

          if (response.ok) {
            reply.send({ ok: true, message: 'Telegram bot is working' });
          } else {
            reply.status(400).send({ error: 'Invalid Telegram token' });
          }
        } catch (error) {
          logger.error('Telegram test error', { error });
          reply.status(500).send({ error: 'Test failed' });
        }
      }
    );

    // ==================== SESSION ROUTES ====================

    /**
     * Start session
     */
    fastify.post(
      '/api/sessions/start',
      async (request, reply) => {
        try {
          const { userId } = ensureAuth(request);
          const activeSession = await sessionManager.startSession(userId);
          reply.send({
            sessionId: activeSession.session.id,
            status: activeSession.session.status,
            startedAt: activeSession.session.started_at
          });
        } catch (error) {
          logger.error('Start session error', { error });
          reply.status(500).send({ error: 'Failed to start session' });
        }
      }
    );

    /**
     * Stop session
     */
    fastify.post(
      '/api/sessions/stop',
      async (request, reply) => {
        try {
          const { userId } = ensureAuth(request);
          await sessionManager.stopSession(userId);
          reply.send({ ok: true });
        } catch (error) {
          logger.error('Stop session error', { error });
          reply.status(500).send({ error: 'Failed to stop session' });
        }
      }
    );

    /**
     * Get current session
     */
    fastify.get(
      '/api/sessions/current',
      async (request, reply) => {
        try {
          const { userId } = ensureAuth(request);
          const session = sessionManager.getSession(userId);
          reply.send(session || null);
        } catch (error) {
          reply.status(401).send({ error: 'Unauthorized' });
        }
      }
    );

    /**
     * Get session logs
     */
    fastify.get<{ Querystring: { limit?: string } }>(
      '/api/sessions/logs',
      async (request, reply) => {
        try {
          const { userId } = ensureAuth(request);
          const limit = parseInt(request.query.limit || '100');
          const logs = sessionManager.getLogs(userId, limit);
          reply.send(logs);
        } catch (error) {
          reply.status(401).send({ error: 'Unauthorized' });
        }
      }
    );

    /**
     * Get session stats
     */
    fastify.get(
      '/api/sessions/stats',
      async (request, reply) => {
        try {
          const { userId } = ensureAuth(request);
          const isActive = sessionManager.isSessionActive(userId);
          reply.send({ isActive, sessionManager: sessionManager.getStats() });
        } catch (error) {
          logger.error('Get stats error', { error });
          reply.status(500).send({ error: 'Failed to get stats' });
        }
      }
    );
  });

  /**
   * Public routes (без auth)
   */
  fastify.get('/', async (_request, reply) => {
    const html = await readFile(join(publicDir, 'index.html'), 'utf-8');
    return reply.type('text/html; charset=utf-8').send(html);
  });

  fastify.get('/about', async (_request, reply) => {
    const html = await readFile(join(publicDir, 'about.html'), 'utf-8');
    return reply.type('text/html; charset=utf-8').send(html);
  });

  fastify.get('/styles.css', async (_request, reply) => {
    const css = await readFile(join(publicDir, 'styles.css'), 'utf-8');
    return reply.type('text/css; charset=utf-8').send(css);
  });

  fastify.get('/app.js', async (_request, reply) => {
    const js = await readFile(join(publicDir, 'app.js'), 'utf-8');
    return reply.type('application/javascript; charset=utf-8').send(js);
  });

  /**
   * Capture phone leads for callback
   */
  fastify.post('/api/leads', async (request, reply) => {
    try {
      const body = request.body as { phone?: string; name?: string };

      if (!body?.phone?.trim()) {
        reply.status(400);
        return { error: 'Введіть номер телефону' };
      }

      const lead = await createLead(body.phone, body.name);
      return { success: true, id: lead.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      if (message === 'Invalid phone number') {
        reply.status(400);
        return { error: 'Невірний формат номера' };
      }
      logger.error('Error saving lead', { error });
      reply.status(500);
      return { error: 'Не вдалося зберегти заявку' };
    }
  });

  /**
   * List leads (admin)
   */
  fastify.get('/api/admin/leads', async (_request, reply) => {
    try {
      const leads = await getLeads();
      return leads;
    } catch (error) {
      logger.error('Error fetching leads', { error });
      reply.status(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * Health check
   */
  fastify.get('/health', async (_request, reply) => {
    logger.info(`API health ${reply}`);
    const tiktok = await getTikTokManager();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      tiktok: tiktok.getStats(),
    };
  });

  /**
   * Get order by ID
   */
  fastify.get('/api/orders/:orderId', async (request, reply) => {
    try {
      const { orderId } = request.params as { orderId: string };
      const order = await getOrder(parseInt(orderId));

      if (!order) {
        reply.status(404);
        return { error: 'Order not found' };
      }

      return order;
    } catch (error) {
      logger.error('Error fetching order', { error });
      reply.status(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * Get orders by TikTok nickname
   */
  fastify.get('/api/orders/tiktok/:nickname', async (request, reply) => {
    try {
      const { nickname } = request.params as { nickname: string };
      const orders = await getOrdersByTiktok(decodeURIComponent(nickname));
      return orders;
    } catch (error) {
      logger.error('Error fetching orders', { error });
      reply.status(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * Get orders by status (admin)
   */
  fastify.get('/api/admin/orders/status/:status', async (request, reply) => {
    try {
      const { status } = request.params as { status: string };
      const orders = await getOrdersByStatus(status);
      return orders;
    } catch (error) {
      logger.error('Error fetching orders by status', { error });
      reply.status(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * Get pending payment orders (admin)
   */
  fastify.get('/api/admin/orders/pending', async (_request, reply) => {
    try {
      const orders = await getOrdersPendingPayment();
      return orders;
    } catch (error) {
      logger.error('Error fetching pending orders', { error });
      reply.status(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * Get user reservations
   */
  fastify.get('/api/reservations/:nickname', async (request, reply) => {
    try {
      const { nickname } = request.params as { nickname: string };
      const reservations = await getUserReservations(decodeURIComponent(nickname));
      return reservations;
    } catch (error) {
      logger.error('Error fetching reservations', { error });
      reply.status(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * Check if product is available
   */
  fastify.get('/api/availability/:productCode/:size', async (request, reply) => {
    try {
      const { productCode, size } = request.params as {
        productCode: string;
        size: string;
      };

      const reservation = await getReservation(productCode.toUpperCase(), size);

      return {
        available: !reservation,
        reserved: !!reservation,
        reservedBy: reservation?.tiktokNickname,
        expiresAt: reservation?.expiresAt,
      };
    } catch (error) {
      logger.error('Error checking availability', { error });
      reply.status(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * Get TikTok connection status
   */
  fastify.get('/api/status/tiktok', async (_request, reply) => {
    try {
      const tiktok = await getTikTokManager();
      return tiktok.getStats();
    } catch (error) {
      logger.error('Error getting TikTok status', { error });
      reply.status(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * Cleanup expired reservations (admin)
   */
  fastify.post('/api/admin/cleanup', async (_request, reply) => {
    try {
      const cleaned = await cleanupExpiredReservations();
      return {
        cleaned,
        message: `Cleaned up ${cleaned} expired reservations`,
      };
    } catch (error) {
      logger.error('Error cleaning up reservations', { error });
      reply.status(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * Get Nova Poshta cities
   */
  fastify.get('/api/novaposhta/cities', async (_request, reply) => {
    try {
      const np = getNovaPoshtaClient();

      if (!np.isConfigured()) {
        reply.status(503);
        return { error: 'Nova Poshta not configured' };
      }

      const cities = await np.getCities();
      return cities;
    } catch (error) {
      logger.error('Error fetching cities', { error });
      reply.status(500);
      return { error: 'Internal server error' };
    }
  });

  /**
   * Get Nova Poshta branches for city
   */
  fastify.get('/api/novaposhta/branches/:cityRef', async (request, reply) => {
    try {
      const { cityRef } = request.params as { cityRef: string };
      const np = getNovaPoshtaClient();

      if (!np.isConfigured()) {
        reply.status(503);
        return { error: 'Nova Poshta not configured' };
      }

      const branches = await np.getBranches(cityRef);
      return branches;
    } catch (error) {
      logger.error('Error fetching branches', { error });
      reply.status(500);
      return { error: 'Internal server error' };
    }
  });

  return fastify;
}

export async function startServer(port: number = 3000): Promise<void> {
  const fastify = await createServer();

  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    logger.info(`API server started on port ${port}`);
  } catch (error) {
    logger.error('Failed to start server', { error });
    throw error;
  }
}
