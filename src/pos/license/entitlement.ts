// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Licence gate for the AUTHOR's own online services (TechDocs/POS_LICENSING.md,
// phase 2D). This is "ordinary account authentication for a network service the
// user chooses to use" that OwnNet 1.1 §1.145 permits — explicitly NOT a Closed
// System and NOT a kill switch: it only decides whether the AUTHOR's server
// (the-live.shop: the update feed, future online conveniences) answers a
// request. A deployment's own POS keeps running regardless; nothing here can
// reach into or disable a lawfully-run copy.
//
// The request carries a licence token (the same signed token as LICENSE_KEY) in
// the `X-License-Key` header or a `?key=` query param. We verify it locally with
// the trusted public keys — no DB, no network — and allow or refuse.

import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyLicenseToken, type LicenseClaim, type VerifyOptions } from './token.js';

export interface Entitlement {
  entitled: boolean;
  licensee: string | null;
  plan: string | null;
  expires_at: string | null;
  /** Why it is not entitled, when it isn't — the verify verdict's reason. */
  reason: string | null;
}

/** Pure: verify a licence token into an entitlement verdict. Never throws. */
export function checkEntitlement(token: string | null | undefined, options: VerifyOptions = {}): Entitlement {
  const verdict = verifyLicenseToken(token ?? undefined, options);
  if (!verdict.ok) {
    return { entitled: false, licensee: null, plan: null, expires_at: null, reason: verdict.reason };
  }
  const claim: LicenseClaim = verdict.claim;
  return {
    entitled: true,
    licensee: claim.licensee,
    plan: claim.plan ?? null,
    expires_at: claim.expires_at ?? null,
    reason: null,
  };
}

/** Read the licence token a request presents: `X-License-Key` header, else `?key=`. */
export function licenseTokenFromRequest(request: FastifyRequest): string | null {
  const header = request.headers['x-license-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const q = (request.query as Record<string, unknown> | undefined)?.key;
  if (typeof q === 'string' && q.trim()) return q.trim();
  return null;
}

/**
 * Fastify guard for an author-hosted service: if the request's licence token is
 * valid, returns the entitlement; otherwise replies 403 and returns null (the
 * handler must stop). Use it like `ensurePosOwner`:
 *   const ent = requireValidLicense(request, reply); if (!ent) return;
 */
export function requireValidLicense(request: FastifyRequest, reply: FastifyReply): Entitlement | null {
  const ent = checkEntitlement(licenseTokenFromRequest(request));
  if (!ent.entitled) {
    reply.code(403).send({ entitled: false, reason: ent.reason });
    return null;
  }
  return ent;
}
