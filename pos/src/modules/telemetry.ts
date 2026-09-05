// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Structured events for the module-remote machinery — one place the boot-time
 * descriptor swap (`registry.ts`), the per-route error boundary
 * (`RouteErrorBoundary`), the API-version skew check (`services/api.ts`) and the
 * boot session-manifest report all feed into, instead of scattered `console.*`.
 *
 * The optional network sink is `telemetryBeacon.ts` (roadmap #6), off unless a
 * build/localStorage flag is set. This module stays dependency-free so it can be
 * pulled into a standalone remote build without dragging anything along.
 */

export type ModuleEvent =
  | { type: 'remote_load_ok'; moduleId: string; url: string; attempts: number }
  | { type: 'remote_load_error'; moduleId: string; url: string; attempts: number; error: unknown }
  | { type: 'remote_load_fallback'; moduleId: string; url: string; reason: string }
  | { type: 'route_render_error'; moduleId: string; error: unknown }
  | {
      type: 'session_manifest';
      appVersion: string;
      apiClientVersion: number;
      modules: Array<{ id: string; version: string; source: 'bundled' | 'remote'; url?: string }>;
    }
  | { type: 'api_version_skew'; clientVersion: number; serverVersion: number };

export type StampedModuleEvent = ModuleEvent & { at: number };

type Listener = (event: StampedModuleEvent) => void;

const MAX_LOG = 50;
const log: StampedModuleEvent[] = [];
const listeners = new Set<Listener>();

/** Report a module-remote lifecycle event. */
export function reportModuleEvent(event: ModuleEvent): void {
  const stamped: StampedModuleEvent = { ...event, at: Date.now() };

  log.push(stamped);
  if (log.length > MAX_LOG) log.shift();

  const line = 'moduleId' in event ? `[module:${event.type}] ${event.moduleId}` : `[module:${event.type}]`;
  if (event.type === 'remote_load_error' || event.type === 'route_render_error') {
    console.error(line, 'error' in event ? event.error : undefined);
  } else if (event.type === 'session_manifest') {
    console.info(line, event.modules);
  } else {
    console.warn(line, event);
  }

  for (const l of listeners) {
    try {
      l(stamped);
    } catch {
      /* a bad listener must not break reporting */
    }
  }
}

/** Subscribe to module events. Returns an unsubscribe fn. */
export function onModuleEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Recent events, oldest first — for debugging and the #6 network sink. */
export function getModuleEventLog(): ReadonlyArray<StampedModuleEvent> {
  return log.slice();
}

// Debug handle: `window.__POS_TELEMETRY__.log()` dumps the ring buffer,
// `.subscribe(fn)` tails it. No-op outside a browser (e.g. Vitest node env).
if (typeof window !== 'undefined') {
  (window as unknown as { __POS_TELEMETRY__?: unknown }).__POS_TELEMETRY__ = {
    log: getModuleEventLog,
    subscribe: onModuleEvent,
  };
}
