import { invoke } from '@tauri-apps/api/core';

export type DeviceKind = 'scanner' | 'printer' | 'unknown';
export type DriverStatus = 'not_needed';

export interface HardwareDevice {
  vendor_id: number;
  product_id: number;
  name: string | null;
  kind: DeviceKind;
  recognized: boolean;
  driver_status: DriverStatus;
}

export function listHardware(): Promise<HardwareDevice[]> {
  return invoke('list_hardware');
}
