// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The telemetry beacon is dormant unless a build flag
 * (`VITE_POS_TELEMETRY_BEACON=1`) or `localStorage['pos_telemetry_beacon']='1'`
 * opts in. Each test gets a fresh module graph so the module-level `started`
 * latch and the telemetry listener set don't leak between cases.
 */
async function freshModules() {
  vi.resetModules();
  const telemetry = await import('./telemetry');
  const beacon = await import('./telemetryBeacon');
  return { ...telemetry, ...beacon };
}

/** jsdom's Blob has no `.text()` — read it the long way. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsText(blob);
  });
}

let sendBeacon: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sendBeacon = vi.fn(() => true);
  Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('maybeStartTelemetryBeacon', () => {
  it('does nothing when no flag is set', async () => {
    const { maybeStartTelemetryBeacon, reportModuleEvent } = await freshModules();
    maybeStartTelemetryBeacon();
    reportModuleEvent({ type: 'api_version_skew', clientVersion: 1, serverVersion: 2 });
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('forwards a whitelisted event once the localStorage flag is on', async () => {
    localStorage.setItem('pos_telemetry_beacon', '1');
    const { maybeStartTelemetryBeacon, reportModuleEvent } = await freshModules();
    maybeStartTelemetryBeacon();

    reportModuleEvent({ type: 'api_version_skew', clientVersion: 1, serverVersion: 2 });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [, blob] = sendBeacon.mock.calls[0] as [string, Blob];
    const payload = JSON.parse(await readBlob(blob));
    expect(payload.event.type).toBe('api_version_skew');
    expect(typeof payload.sessionId).toBe('string');
    expect(typeof payload.appVersion).toBe('string');
  });

  it('does not forward the remote_load_ok chatter', async () => {
    localStorage.setItem('pos_telemetry_beacon', '1');
    const { maybeStartTelemetryBeacon, reportModuleEvent } = await freshModules();
    maybeStartTelemetryBeacon();

    reportModuleEvent({ type: 'remote_load_ok', moduleId: 'stock', url: 'x', attempts: 1 });

    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('swallows a throwing sendBeacon', async () => {
    localStorage.setItem('pos_telemetry_beacon', '1');
    sendBeacon.mockImplementation(() => {
      throw new Error('boom');
    });
    const { maybeStartTelemetryBeacon, reportModuleEvent } = await freshModules();
    maybeStartTelemetryBeacon();

    expect(() =>
      reportModuleEvent({ type: 'api_version_skew', clientVersion: 1, serverVersion: 2 })
    ).not.toThrow();
  });

  it('is idempotent — a second start does not double-forward', async () => {
    localStorage.setItem('pos_telemetry_beacon', '1');
    const { maybeStartTelemetryBeacon, reportModuleEvent } = await freshModules();
    maybeStartTelemetryBeacon();
    maybeStartTelemetryBeacon();

    reportModuleEvent({ type: 'api_version_skew', clientVersion: 1, serverVersion: 2 });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });
});
