// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useState } from 'react';
import { inspectRemoteManifest, type RemoteManifestInfo } from '../modules/remoteVerify';
import { isAllowedRemoteUrl } from '../lib/moduleRemoteForm';

export type ProbeState =
  | { state: 'idle' }
  | { state: 'busy' }
  | { state: 'ok'; info: RemoteManifestInfo }
  | { state: 'error'; message: string };

/** Verify a source's signed manifest in the browser; `expectId` must match when given. */
export async function probeRemoteUrl(url: string, expectId: string | null): Promise<ProbeState> {
  if (!isAllowedRemoteUrl(url)) {
    return { state: 'error', message: 'Джерело: https://…, шлях від кореня /… або http://localhost.' };
  }
  try {
    const info = await inspectRemoteManifest(url);
    if (expectId && info.moduleId !== expectId) {
      return { state: 'error', message: `Джерело описує модуль «${info.moduleId}», а запис — «${expectId}».` };
    }
    return { state: 'ok', info };
  } catch (err) {
    return { state: 'error', message: err instanceof Error ? err.message : 'Не вдалося перевірити джерело.' };
  }
}

export function useProbe(): [ProbeState, (url: string, expectId: string | null) => Promise<ProbeState>] {
  const [probe, setProbe] = useState<ProbeState>({ state: 'idle' });
  async function run(url: string, expectId: string | null) {
    setProbe({ state: 'busy' });
    const next = await probeRemoteUrl(url.trim(), expectId);
    setProbe(next);
    return next;
  }
  return [probe, run];
}
