// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { invoke } from '@tauri-apps/api/core';

export interface UpdateInfo {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  download_url: string | null;
  release_url: string | null;
  notes: string | null;
  /** macOS and Linux AppImage installs update in place; the rest download by hand. */
  can_self_update: boolean;
}

export function checkForUpdate(): Promise<UpdateInfo> {
  return invoke('check_for_update');
}

/**
 * Downloads, verifies and installs the update, then restarts the app — so this
 * promise only ever settles by rejecting. Offer it when `can_self_update`.
 *
 * `updateToken` is this deployment's delivery token for the author's update feed
 * (`fetchUpdateToken` in `./updateToken`; TechDocs/POS_LICENSING.md 2D-B). The
 * command sends it only to the update endpoint baked into the binary and drops it
 * before the installer is downloaded. This file stays free of `@pos/platform`
 * on purpose: the update store reaches it from the global test setup and from
 * every screen's chrome, and the whole platform barrel does not belong there.
 */
export function installUpdate(updateToken: string | null = null): Promise<void> {
  return invoke('install_update', { updateToken });
}
