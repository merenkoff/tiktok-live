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
 */
export function installUpdate(): Promise<void> {
  return invoke('install_update');
}
