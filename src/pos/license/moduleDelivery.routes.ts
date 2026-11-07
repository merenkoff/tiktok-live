// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Routes of the licence-gated module delivery (TechDocs/POS_OPENCORE.md §8) —
// the rules and why are in `moduleDelivery.ts`.
//
//   POST /api/modules/token                       X-License-Key → { token, scope, expires_at }
//   GET  /api/modules/t/:token/:id/:version/*     a bundle file, with a delivery token
//   GET  /api/modules/:id/:version/*              the same file, anonymously
//   DELETE|PUT|POST /api/modules/upload/…         CI puts a build into the closed store (O-3, `moduleUpload.ts`)
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
import {
  ModuleUploadError,
  clearStaged,
  commitStaged,
  moduleUploadSecret,
  stageFile,
  uploadAuthorized,
} from './moduleUpload.js';

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

// ── Upload into the closed store (O-3) ─────────────────────────────────────

let uploadKeysForTests: Readonly<Record<string, string>> | null = null;

/** Test seam: accept manifests signed with these keys instead of the PROD one. */
export function setModuleUploadKeysForTests(keys: Readonly<Record<string, string>> | null): void {
  uploadKeysForTests = keys;
}

const UPLOAD_FILE_LIMIT = 10 * 1024 * 1024;

/**
 * `DELETE|PUT|POST /api/modules/upload/:id/:version[/…]` — the Module Release
 * workflow's way into the closed bundle store (`moduleUpload.ts`). An
 * encapsulated plugin, so the raw-bytes body parser applies here only.
 */
export async function moduleUploadRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: UPLOAD_FILE_LIMIT },
    (_request, body, done) => done(null, body)
  );

  const guard = (authorization: string | undefined, reply: FastifyReply): boolean => {
    const secret = moduleUploadSecret();
    if (!secret) {
      reply.status(503).send({ error: 'module_upload_disabled' });
      return false;
    }
    if (!uploadAuthorized(authorization, secret)) {
      reply.status(401).send({ error: 'unauthorized' });
      return false;
    }
    return true;
  };

  const fail = (error: unknown, reply: FastifyReply, id: string) => {
    if (error instanceof ModuleUploadError) {
      reply.status(error.status);
      return { error: error.code, message: error.message };
    }
    logger.error('module upload failed', { error: error instanceof Error ? error.message : 'unknown', id });
    reply.status(500);
    return { error: 'module_upload_failed' };
  };

  fastify.delete('/api/modules/upload/:id/:version', async (request, reply) => {
    if (!guard(request.headers.authorization, reply)) return reply;
    const { id, version } = request.params as { id: string; version: string };
    try {
      await clearStaged(id, version);
      return { ok: true };
    } catch (error) {
      return fail(error, reply, id);
    }
  });

  fastify.put('/api/modules/upload/:id/:version/:file', async (request, reply) => {
    if (!guard(request.headers.authorization, reply)) return reply;
    const { id, version, file } = request.params as { id: string; version: string; file: string };
    if (!Buffer.isBuffer(request.body)) {
      reply.status(415);
      return { error: 'octet_stream_expected', message: 'Send the file as application/octet-stream.' };
    }
    try {
      await stageFile(id, version, file, request.body);
      return { ok: true, bytes: request.body.length };
    } catch (error) {
      return fail(error, reply, id);
    }
  });

  fastify.post('/api/modules/upload/:id/:version/commit', async (request, reply) => {
    if (!guard(request.headers.authorization, reply)) return reply;
    const { id, version } = request.params as { id: string; version: string };
    try {
      const result = await commitStaged(id, version, uploadKeysForTests ? { keys: uploadKeysForTests } : {});
      logger.info('module upload committed', { id, version, status: result.status, files: result.files });
      return { ...result, module_id: id, version, entry: `/api/modules/${id}/${version}/remote-entry.js` };
    } catch (error) {
      return fail(error, reply, id);
    }
  });
}
