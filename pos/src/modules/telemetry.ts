// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Structured events for the module-remote machinery — one place the boot-time
 * descriptor swap (`registry.ts`) and the per-route error boundary
 * (`RouteErrorBoundary`) report into, instead of scattered `console.*`.
 *
 * No network sink here: wiring these to Sentry / a backend endpoint is roadmap
 * #6. This is the seam it attaches to. Kept dependency-free so it can be pulled
 * into a standalone remote build without dragging anything along.
 */

export type ModuleEvent =
  | { type: 'remote_load_ok'; moduleId: string; url: string; attempts: number }
  | { type: 'remote_load_error'; moduleId: string; url: string; attempts: number; error: unknown }
  | { type: 'remote_load_fallback'; moduleId: string; url: string; reason: string }
  | { type: 'route_render_error'; moduleId: string; error: unknown };

type Listener = (event: ModuleEvent & { at: number }) => void;

const MAX_LOG = 50;
const log: Array<ModuleEvent & { at: number }> = [];
const listeners = new Set<Listener>();

/** Report a module-remote lifecycle event. */
export function reportModuleEvent(event: ModuleEvent): void {
  const stamped = { ...event, at: Date.now() };

  log.push(stamped);
  if (log.length > MAX_LOG) log.shift();

  const line = `[module:${event.type}] ${event.moduleId}`;
  if (event.type === 'remote_load_error' || event.type === 'route_render_error') {
    console.error(line, 'error' in event ? event.error : undefined);
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

/** Recent events, oldest first — for debugging and the future #6 sink. */
export function getModuleEventLog(): ReadonlyArray<ModuleEvent & { at: number }> {
  return log.slice();
}
