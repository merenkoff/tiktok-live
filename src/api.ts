import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import path from 'path';
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
import { ensureAuth } from './core/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

//Double routes check here and in files like sessions.controller atc... and controllers // seems like controllers is the better aproch but now i cant cheak all of the routes. It wiil be fixed later
export async function createServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // ── CORS ──────────────────────────────────────────────────────────────────
  // Дозволяємо локальний фронт під час розробки + продакшн домен
  await fastify.register(cors, {
    origin: (origin, cb) => {
      const allowed = [
        'https://the-live.shop',
        'http://localhost:3001',
        'http://localhost:5173',
      ];
      // Запити без origin (curl, Postman, SSR) — пропускаємо
      if (!origin || allowed.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ⭐ CRITICAL: Register static file serving BEFORE routes
  // Serve static files from public directory
  await fastify.register(staticPlugin, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/',
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

export async function startServer(fastify: FastifyInstance, port: number = 3000): Promise<void> {
  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    logger.info(`API server started on port ${port}`);
  } catch (error) {
    logger.error('Failed to start server', { error });
    throw error;
  }
}
