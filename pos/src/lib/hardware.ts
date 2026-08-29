// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { invoke } from '@tauri-apps/api/core';

export type DeviceKind = 'scanner' | 'printer' | 'unknown';
export type DriverStatus = 'not_needed';

export interface HardwareDevice {
  vendor_id: number;
  product_id: number;
  name: string | null;
  manufacturer: string | null;
  product: string | null;
  kind: DeviceKind;
  recognized: boolean;
  driver_status: DriverStatus;
}

export function listHardware(): Promise<HardwareDevice[]> {
  return invoke('list_hardware');
}
