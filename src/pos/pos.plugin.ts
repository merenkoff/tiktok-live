// src/pos/pos.plugin.ts

import path from 'path';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { registerPosRoutes } from './pos.controller.js';
import { ensureUploadsDir, POS_UPLOADS_DIR, POS_UPLOADS_PREFIX } from './uploads.service.js';
import { logger } from '../logger.js';

export async function registerPosPlugin(fastify: FastifyInstance): Promise<void> {
  await ensureUploadsDir();

  await fastify.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
    },
  });

  await fastify.register(staticPlugin, {
    root: POS_UPLOADS_DIR,
    prefix: `${POS_UPLOADS_PREFIX}/`,
    decorateReply: false,
  });

  await fastify.register(
    async (instance) => {
      await registerPosRoutes(instance);
    },
    { prefix: '/api/pos' }
  );

  logger.info(`POS routes at /api/pos; uploads at ${POS_UPLOADS_PREFIX} → ${path.basename(POS_UPLOADS_DIR)}`);
}
