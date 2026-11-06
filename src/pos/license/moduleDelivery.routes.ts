// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Routes of the licence-gated module delivery (TechDocs/POS_OPENCORE.md §8) —
// the rules and why are in `moduleDelivery.ts`.
//
//   POST /api/modules/token                       X-License-Key → { token, scope, expires_at }
//   GET  /api/modules/t/:token/:id/:version/*     a bundle file, with a delivery token
//   GET  /api/modules/:id/:version/*              the same file, anonymously
//
// Both GETs answer with `Access-Control-Allow-Origin: *` (a till on any origin
// `import()`s the bundle, as it did from jsdelivr; the credential is the path,
// never a cookie) and `Cache-Control: private` — a versioned bundle never
// changes, but a gated one must not sit in a shared cache for whoever asks next.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { logger } from '../../logger.js';
import { licenseTokenFromRequest } from './entitlement.js';
import type { VerifyOptions } from './token.js';
import {
  contentTypeOf,
  issueModuleToken,
  moduleGateOn,
  moduleTokenSecret,
  parseModulePath,
  readStoredBundleFile,
  recordIssued,
  upstreamUrlOf,
  verifyModuleToken,
  wasIssued,
  type ModulePath,
} from './moduleDelivery.js';

let verifyOptionsForTests: VerifyOptions | null = null;

/** Test seam: verify licence tokens with these keys instead of the committed ones. */
export function setModuleDeliveryKeysForTests(options: VerifyOptions | null): void {
  verifyOptionsForTests = options;
}

function deliveryHeaders(reply: FastifyReply): void {
  reply.header('access-control-allow-origin', '*');
  reply.header('cache-control', 'private, max-age=31536000, immutable');
  reply.header('x-content-type-options', 'nosniff');
}

async function sendBundleFile(p: ModulePath, reply: FastifyReply): Promise<unknown> {
  let stored: Buffer | null = null;
  try {
    stored = await readStoredBundleFile(p);
  } catch (error) {
    logger.warn('module delivery: bundle store unreadable', {
      error: error instanceof Error ? error.message : 'read_failed',
      id: p.id,
    });
  }
  if (stored) {
    deliveryHeaders(reply);
    reply.type(contentTypeOf(p.file));
    return reply.send(stored);
  }
  try {
    const res = await fetch(upstreamUrlOf(p), { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      logger.warn('module delivery: upstream non-2xx', { status: res.status, id: p.id, version: p.version });
      reply.header('access-control-allow-origin', '*');
      reply.status(res.status === 404 ? 404 : 502);
      return { error: 'module_unavailable' };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    deliveryHeaders(reply);
    reply.type(contentTypeOf(p.file));
    return reply.send(buf);
  } catch (error) {
    logger.warn('module delivery: upstream unreachable', {
      error: error instanceof Error ? error.message : 'fetch_failed',
      id: p.id,
    });
    reply.header('access-control-allow-origin', '*');
    reply.status(502);
    return { error: 'module_unavailable' };
  }
}

export function registerModuleDeliveryRoutes(fastify: FastifyInstance): void {
  fastify.post('/api/modules/token', async (request, reply) => {
    const secret = moduleTokenSecret();
    if (!secret) {
      reply.status(503);
      return { error: 'module_tokens_disabled' };
    }
    const result = issueModuleToken(licenseTokenFromRequest(request), secret, verifyOptionsForTests ?? {});
    if (!result.ok) {
      reply.status(403);
      return { entitled: false, reason: result.reason };
    }
    return result.grant;
  });

  const deliver = async (
    params: { token?: string; id: string; version: string; '*': string },
    reply: FastifyReply
  ): Promise<unknown> => {
    const p = parseModulePath(params.id, params.version, params['*'] ?? '');
    if (!p) {
      reply.header('access-control-allow-origin', '*');
      reply.status(400);
      return { error: 'bad_module_path' };
    }
    const claim = params.token ? verifyModuleToken(params.token, moduleTokenSecret()) : null;

    if (moduleGateOn()) {
      if (!claim) {
        reply.header('access-control-allow-origin', '*');
        reply.status(403);
        return { entitled: false, reason: params.token ? 'bad_module_token' : 'absent' };
      }
      if (claim.scope === 'issued' && !(await wasIssued(claim.fp, p))) {
        reply.header('access-control-allow-origin', '*');
        reply.status(403);
        return { entitled: false, reason: 'not_issued' };
      }
    }

    // A licence in good standing is recorded whether or not the gate is on, so
    // the journal is already full on the day the author switches it on — or an
    // expired licence would find nothing it was given.
    if (claim?.scope === 'all') {
      await recordIssued(claim.fp, p).catch((error: unknown) => {
        logger.warn('module delivery: journal write failed', {
          error: error instanceof Error ? error.message : 'insert_failed',
          id: p.id,
        });
      });
    }
    return sendBundleFile(p, reply);
  };

  fastify.get('/api/modules/t/:token/:id/:version/*', async (request, reply) =>
    deliver(request.params as { token: string; id: string; version: string; '*': string }, reply)
  );
  fastify.get('/api/modules/:id/:version/*', async (request, reply) =>
    deliver(request.params as { id: string; version: string; '*': string }, reply)
  );
}
