// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

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
} from './orders.js';
import {
  getReservationsByNickname,
  getReservation,
  cleanupExpiredReservations,
} from './reservations.js';
import { createNovaPoshtaClient } from './novaposhta.js';
import { getUserSettings } from './users/users.service.js';
import { ensureAuth, isUnauthorizedError } from './core/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const siteDistDir = join(__dirname, '..', 'site', 'dist');

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
        'http://localhost:3002',
        'http://localhost:3003',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:3002',
        'http://127.0.0.1:3003',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'https://tauri.localhost',
        'http://tauri.localhost',
        'tauri://localhost',
        'https://creative-trust-production-95f7.up.railway.app',
        'https://creative-trust-production-95f7.up.railway.app:3001',
      ];
      const extra = (process.env.CORS_ORIGINS || process.env.EXTRA_CORS_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      allowed.push(...extra);
      // Dev: allow any localhost / 127.0.0.1 port
      const isLocalDev =
        !!origin &&
        (/^http:\/\/localhost:\d+$/.test(origin) ||
          /^http:\/\/127\.0\.0\.1:\d+$/.test(origin));
      // Запити без origin (curl, Postman, SSR) — пропускаємо
      if (!origin || allowed.includes(origin) || isLocalDev) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-POS-API-Version',
    ],
    exposedHeaders: ['X-POS-API-Version'],
  });

  // ⭐ CRITICAL: Register static file serving BEFORE routes
  // Serve static files from public directory
  await fastify.register(staticPlugin, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/',
  });

  // New marketing site's hashed build assets (site/dist/assets/*) — separate
  // prefix from the public/ mount above, so no route collision.
  await fastify.register(staticPlugin, {
    root: join(siteDistDir, 'assets'),
    prefix: '/assets/',
    decorateReply: false,
  });

  /**
   * Auth for the routes below.
   *
   * Each protected handler awaits this itself — same pattern as the settings /
   * sessions / POS controllers. There used to be a `preHandler` hook here that
   * enforced nothing: it lived inside `fastify.register(...)`, so its scope
   * covered no routes, and it called `ensureAuth` without awaiting, so the
   * rejection could never be caught. Every route below was reachable without a
   * token, including the leads list.
   */
  async function requireAuth(
    request: any,
    reply: any
  ): Promise<{ userId: number; username: string } | null> {
    try {
      return await ensureAuth(request);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        reply.status(401).send({ error: 'Unauthorized' });
        return null;
      }
      throw error;
    }
  }

  /**
   * Public routes (без auth)
   */
  fastify.get('/', async (_request, reply) => {
    const html = await readFile(join(siteDistDir, 'index.html'), 'utf-8');
    return reply.type('text/html; charset=utf-8').send(html);
  });

  fastify.get('/about', async (_request, reply) => {
    const html = await readFile(join(publicDir, 'about.html'), 'utf-8');
    return reply.type('text/html; charset=utf-8').send(html);
  });

  fastify.get('/pos', async (_request, reply) => {
    const html = await readFile(join(siteDistDir, 'pos.html'), 'utf-8');
    return reply.type('text/html; charset=utf-8').send(html);
  });

  fastify.get('/live', async (_request, reply) => {
    const html = await readFile(join(siteDistDir, 'live.html'), 'utf-8');
    return reply.type('text/html; charset=utf-8').send(html);
  });

  fastify.get('/yaku-kasu-obraty', async (_request, reply) => {
    const html = await readFile(join(siteDistDir, 'compare.html'), 'utf-8');
    return reply.type('text/html; charset=utf-8').send(html);
  });

  fastify.get('/styles.css', async (_request, reply) => {
    const css = await readFile(join(publicDir, 'styles.css'), 'utf-8');
    return reply.type('text/css; charset=utf-8').send(css);
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
  fastify.get('/api/admin/leads', async (request, reply) => {
    try {
      if (!(await requireAuth(request, reply))) return;
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
  fastify.get('/health', async () => {
    // Public and deliberately cheap. Per-seller TikTok connection state lives
    // behind auth at /api/sessions/stats.
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });

  /**
   * Get order by ID
   */
  fastify.get('/api/orders/:orderId', async (request, reply) => {
    try {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      const { orderId } = request.params as { orderId: string };
      const order = await getOrder(auth.userId, parseInt(orderId));

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
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      const { nickname } = request.params as { nickname: string };
      const orders = await getOrdersByTiktok(auth.userId, decodeURIComponent(nickname));
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
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      const { status } = request.params as { status: string };
      const orders = await getOrdersByStatus(auth.userId, status);
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
  fastify.get('/api/admin/orders/pending', async (request, reply) => {
    try {
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      const orders = await getOrdersPendingPayment(auth.userId);
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
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      const { nickname } = request.params as { nickname: string };
      const reservations = await getReservationsByNickname(
        auth.userId,
        decodeURIComponent(nickname)
      );
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
      const auth = await requireAuth(request, reply);
      if (!auth) return;
      const { productCode, size } = request.params as {
        productCode: string;
        size: string;
      };

      const reservation = await getReservation(
        auth.userId,
        productCode.toUpperCase(),
        size
      );

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
   * Cleanup expired reservations (admin)
   */
  fastify.post('/api/admin/cleanup', async (request, reply) => {
    try {
      if (!(await requireAuth(request, reply))) return;
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
   * Nova Poshta address book, using the caller's own API key from
   * `user_settings` (the LIVE admin Settings page). 503 when they haven't
   * filled it in yet.
   */
  async function novaPoshtaFor(request: any, reply: any) {
    const auth = await requireAuth(request, reply);
    if (!auth) return null;

    const settings = await getUserSettings(auth.userId);
    const np = createNovaPoshtaClient(settings ?? {});

    if (!np.isConfigured()) {
      reply.status(503).send({ error: 'Nova Poshta not configured' });
      return null;
    }

    return np;
  }

  fastify.get('/api/novaposhta/cities', async (request, reply) => {
    try {
      const np = await novaPoshtaFor(request, reply);
      if (!np) return;
      return await np.getCities();
    } catch (error) {
      logger.error('Error fetching cities', { error });
      reply.status(500);
      return { error: 'Internal server error' };
    }
  });

  fastify.get('/api/novaposhta/branches/:cityRef', async (request, reply) => {
    const { cityRef } = request.params as { cityRef: string };
    try {
      const np = await novaPoshtaFor(request, reply);
      if (!np) return;
      return await np.getBranches(cityRef);
    } catch (error) {
      logger.error('Error fetching branches', { error, cityRef });
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
