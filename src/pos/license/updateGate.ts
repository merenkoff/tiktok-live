// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Who may read the AUTHOR's desktop update feed while `LICENSE_UPDATE_GATE` is on
// (TechDocs/POS_LICENSING.md, phase 2D-B). Two credentials open it:
//
//   * a licence token (`X-License-Key` header or `?key=`) — what 2D-A shipped, and
//     what anything holding the key itself (a script, `curl`) still presents;
//   * a DELIVERY token (`X-Delivery-Token` header) — what the desktop cashier
//     presents. It is the token the deployment's server already holds for module
//     delivery (`moduleToken.ts`) and already puts into every till's module URLs,
//     so the licence key itself stays on the server (2D-C, rule 2) instead of
//     travelling to every cashier's machine.
//
// A delivery token of scope `issued` (an authentic licence that has expired) does
// NOT open the feed: «what was given stays given» (OwnNet §1.12) is why such a
// licence still gets the module versions it was already handed, but a new desktop
// version has never been handed to it. That matches the licence path, where an
// expired token is refused. Like the module gate, the check is stateless: a
// delivery token keeps working until its own expiry (30–60 days) even if the
// licence it names ran out inside that window.
//
// This only decides whether the AUTHOR's server answers a request. It never
// reaches into a deployment: a refused desktop keeps selling on the version it has.

import type { FastifyReply, FastifyRequest } from 'fastify';
import { checkEntitlement, licenseTokenFromRequest } from './entitlement.js';
import { moduleTokenSecret, verifyModuleToken } from './moduleDelivery.js';
import type { VerifyOptions } from './token.js';

/** The header the desktop cashier puts its delivery token in (lower-cased, as Fastify reads it). */
export const UPDATE_TOKEN_HEADER = 'x-delivery-token';

export type UpdateVerdict = { ok: true; via: 'licence' | 'delivery' } | { ok: false; reason: string };

export interface UpdateCredentials {
  licenseToken?: string | null;
  deliveryToken?: string | null;
}

export interface UpdateCheckOptions {
  /** The HMAC key delivery tokens are verified with; defaults to this server's own. */
  secret?: Buffer | null;
  verify?: VerifyOptions;
  now?: Date;
}

/**
 * Pure: may these credentials read the update feed? Never throws. A refusal's
 * `reason` names every credential that was presented and failed, comma-joined.
 */
export function checkUpdateEntitlement(
  presented: UpdateCredentials,
  options: UpdateCheckOptions = {}
): UpdateVerdict {
  const licenseToken = presented.licenseToken?.trim() || null;
  const deliveryToken = presented.deliveryToken?.trim() || null;
  const reasons: string[] = [];

  if (licenseToken) {
    const ent = checkEntitlement(licenseToken, options.verify);
    if (ent.entitled) return { ok: true, via: 'licence' };
    reasons.push(ent.reason ?? 'invalid');
  }

  if (deliveryToken) {
    const secret = options.secret === undefined ? moduleTokenSecret() : options.secret;
    const claim = verifyModuleToken(deliveryToken, secret, options.now);
    if (claim?.scope === 'all') return { ok: true, via: 'delivery' };
    reasons.push(claim ? 'delivery_token_issued_only' : 'bad_delivery_token');
  }

  // Both credentials failed: name both, licence first (`expired,bad_delivery_token`),
  // so a 403 in the logs says why each one did not open the feed.
  return { ok: false, reason: reasons.length > 0 ? reasons.join(',') : 'absent' };
}

/**
 * Fastify guard for the update feed: true when the request may read it,
 * otherwise replies 403 `{ entitled: false, reason }` and returns false (the
 * handler must stop).
 */
export function requireUpdateEntitlement(request: FastifyRequest, reply: FastifyReply): boolean {
  const header = request.headers[UPDATE_TOKEN_HEADER];
  const verdict = checkUpdateEntitlement({
    licenseToken: licenseTokenFromRequest(request),
    deliveryToken: typeof header === 'string' ? header : null,
  });
  if (verdict.ok) return true;
  reply.code(403).send({ entitled: false, reason: verdict.reason });
  return false;
}
