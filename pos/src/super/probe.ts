// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useState } from 'react';
import { inspectRemoteManifest, type RemoteManifestInfo } from '../modules/remoteVerify';
import { isAllowedRemoteUrl } from '../lib/moduleRemoteForm';
import { superApi } from './superApi';

export type ProbeState =
  | { state: 'idle' }
  | { state: 'busy' }
  | { state: 'ok'; info: RemoteManifestInfo }
  | { state: 'error'; message: string };

/** Where the check reads a URL from: the address a till of this copy would get. */
export type ProbeUrlResolver = (url: string) => Promise<string>;

const tillAddress: ProbeUrlResolver = (url) => superApi.moduleProbeUrl(url);

/** The one refusal an operator needs in words: a closed module this copy may not read. */
function inWords(message: string): string {
  // `RemoteVerifyError` words it «remote verification failed: manifest HTTP 403».
  const refused = /\b(manifest|signature) HTTP 403$/.exec(message);
  if (refused) {
    return `Сервер модулів не віддає цю збірку (${refused[0]}): модуль закритий, а ця копія не має чинного токена доставки — перевірте LICENSE_KEY.`;
  }
  return message;
}

/**
 * Verify a source's signed manifest in the browser; `expectId` must match when given.
 *
 * The manifest is read from the address a till of this copy is given at login
 * (`resolve`): a private module on the licence server answers its bare URL with
 * 403 while the delivery gate is on, and is served only with this copy's
 * delivery token in the path. The signature is still checked here, against the
 * keys built into this page — the server only says where to read from. When the
 * server cannot say (an older backend, no connection), the bare URL is checked.
 */
export async function probeRemoteUrl(
  url: string,
  expectId: string | null,
  resolve: ProbeUrlResolver = tillAddress
): Promise<ProbeState> {
  if (!isAllowedRemoteUrl(url)) {
    return { state: 'error', message: 'Джерело: https://…, шлях від кореня /… або http://localhost.' };
  }
  let target = url;
  try {
    target = await resolve(url);
  } catch {
    target = url;
  }
  try {
    const info = await inspectRemoteManifest(target);
    if (expectId && info.moduleId !== expectId) {
      return { state: 'error', message: `Джерело описує модуль «${info.moduleId}», а запис — «${expectId}».` };
    }
    return { state: 'ok', info };
  } catch (err) {
    return { state: 'error', message: err instanceof Error ? inWords(err.message) : 'Не вдалося перевірити джерело.' };
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
