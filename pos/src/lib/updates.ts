import { invoke } from '@tauri-apps/api/core';

export interface UpdateInfo {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  download_url: string | null;
  release_url: string | null;
  notes: string | null;
}

export function checkForUpdate(): Promise<UpdateInfo> {
  return invoke('check_for_update');
}
