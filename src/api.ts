import Fastify, { FastifyInstance } from 'fastify';
import { logger } from './logger.js';
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

export async function createServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
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
