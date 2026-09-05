// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it, vi } from 'vitest';
import { getModuleEventLog, onModuleEvent, reportModuleEvent } from './telemetry';

describe('reportModuleEvent', () => {
  it('rings the buffer and fans out to listeners for the no-moduleId variants', () => {
    const seen: string[] = [];
    const off = onModuleEvent((e) => seen.push(e.type));

    reportModuleEvent({
      type: 'session_manifest',
      appVersion: '1.2.3',
      apiClientVersion: 1,
      modules: [{ id: 'stock', version: '1.2.3', source: 'bundled' }],
    });
    reportModuleEvent({ type: 'api_version_skew', clientVersion: 1, serverVersion: 2 });
    off();

    expect(seen).toEqual(['session_manifest', 'api_version_skew']);
    const log = getModuleEventLog();
    expect(log.at(-2)).toMatchObject({ type: 'session_manifest', appVersion: '1.2.3' });
    expect(log.at(-1)).toMatchObject({ type: 'api_version_skew', serverVersion: 2 });
    expect(typeof log.at(-1)?.at).toBe('number');
  });

  it('formats a no-moduleId event without throwing or printing "undefined"', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    reportModuleEvent({
      type: 'session_manifest',
      appVersion: '9.9.9',
      apiClientVersion: 1,
      modules: [],
    });
    expect(info).toHaveBeenCalledWith('[module:session_manifest]', []);
    info.mockRestore();
  });

  it('a throwing listener does not break reporting', () => {
    const off1 = onModuleEvent(() => {
      throw new Error('bad listener');
    });
    const hits: string[] = [];
    const off2 = onModuleEvent((e) => hits.push(e.type));

    expect(() =>
      reportModuleEvent({ type: 'api_version_skew', clientVersion: 1, serverVersion: 3 })
    ).not.toThrow();
    expect(hits).toEqual(['api_version_skew']);

    off1();
    off2();
  });
});
