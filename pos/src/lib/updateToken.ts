// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { api } from '@pos/platform';

/**
 * The token this deployment's server holds for the author's update feed
 * (`GET /api/pos/license/update-token`; TechDocs/POS_LICENSING.md 2D-B), or
 * null. It is the delivery token the server already puts into module URLs, not
 * the licence key, which never leaves the server.
 *
 * Read at the moment of the press rather than kept from login: it expires after
 * 30–60 days and a cached login can be older. Never throws — offline, an older
 * server without the route and a copy that holds no token all mean «ask the
 * feed without one», which is what an update did before this existed and is
 * all that the feed asks for while its licence gate is off.
 */
export async function fetchUpdateToken(): Promise<string | null> {
  try {
    const answer = await api.posRequest<{ token?: unknown }>('get', '/license/update-token');
    return typeof answer?.token === 'string' && answer.token ? answer.token : null;
  } catch {
    return null;
  }
}
