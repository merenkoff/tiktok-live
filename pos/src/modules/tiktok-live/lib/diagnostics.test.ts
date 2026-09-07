// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The support code is read back to us over the phone, so its shape is a
// contract: if these tags drift, every ticket already in flight decodes wrong.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  diagnose,
  diagnosticText,
  reportLiveFailure,
  resetReportedFailures,
} from './diagnostics';
import { LiveApiError, LiveNotConfiguredError } from './errors';
import { HostTooOldError } from './hostPlatform';

/** An axios-shaped rejection, which is what the bridge call actually throws. */
function axiosError(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status },
  });
}

beforeEach(() => {
  resetReportedFailures();
});

describe('diagnose', () => {
  it('reads the store as unlinked from a 409', () => {
    const d = diagnose(axiosError(409));
    expect(d.reason).toBe('not_configured');
    expect(d.code).toMatch(/^TL-CFG-/);
  });

  it('classifies LiveNotConfiguredError, which carries no axios response', () => {
    // The client converts the 409 into its own error before anyone sees it, so
    // this is the shape that actually reaches the screen.
    const d = diagnose(new LiveNotConfiguredError());
    expect(d.reason).toBe('not_configured');
    expect(d.status).toBe(409);
  });

  it('reads a missing bridge route as a backend that is behind', () => {
    const d = diagnose(axiosError(404));
    expect(d.reason).toBe('server_missing_bridge');
    expect(d.code).toMatch(/^TL-SRV404-/);
  });

  it('puts the status in the tag for any other server error', () => {
    expect(diagnose(axiosError(500)).code).toMatch(/^TL-SRV500-/);
    expect(diagnose(axiosError(502)).code).toMatch(/^TL-SRV502-/);
    expect(diagnose(new LiveApiError(503, 'GET /x → 503')).code).toMatch(/^TL-SRV503-/);
  });

  it('reads a shell older than this module as host_too_old, with the missing symbols', () => {
    const d = diagnose(new HostTooOldError(['apiOrigin', 'api.liveSessionToken']));
    expect(d.reason).toBe('host_too_old');
    expect(d.code).toMatch(/^TL-HOST-/);
    expect(d.status).toBeNull();
  });

  it('reads a response-less error as a dead network', () => {
    const d = diagnose(new Error('Network Error'));
    expect(d.reason).toBe('network');
    expect(d.code).toMatch(/^TL-NET-/);
  });

  it('falls back to UNK for something that is not an Error at all', () => {
    expect(diagnose('boom').code).toMatch(/^TL-UNK-/);
  });

  it('carries both versions, so support can see which side is behind', () => {
    const d = diagnose(axiosError(404));
    expect(d.code).toBe(`TL-SRV404-${d.moduleVersion}-${d.hostVersion}`);
    expect(d.moduleVersion).toBeTruthy();
    expect(d.hostVersion).toBeTruthy();
  });
});

describe('diagnosticText', () => {
  it('identifies the module and stays free of anything sensitive', () => {
    const text = diagnosticText(diagnose(axiosError(500)));
    expect(JSON.parse(text).module).toBe('tiktok-live');
    // This string gets pasted into chats we do not control.
    expect(text).not.toMatch(/token|nickname|tiktok_username|Bearer/i);
  });
});

describe('reportLiveFailure', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('logs a given code once, however often the poller retries', () => {
    const d = diagnose(axiosError(500));
    reportLiveFailure(d);
    reportLiveFailure(d);
    reportLiveFailure(diagnose(axiosError(500)));
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('logs a different failure separately', () => {
    reportLiveFailure(diagnose(axiosError(500)));
    reportLiveFailure(diagnose(axiosError(404)));
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it('parks the latest diagnostic where a support call can read it back', () => {
    const d = diagnose(axiosError(502));
    reportLiveFailure(d);
    expect(
      (window as unknown as { __POS_TIKTOK_LIVE_DIAG__?: unknown }).__POS_TIKTOK_LIVE_DIAG__
    ).toEqual(d);
  });
});
