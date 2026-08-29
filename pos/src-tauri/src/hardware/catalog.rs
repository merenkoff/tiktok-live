// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

use super::DeviceKind;

pub struct KnownDevice {
    pub vendor_id: u16,
    pub product_id: u16,
    pub name: &'static str,
    pub kind: DeviceKind,
}

/// Recognized scanner/printer VID:PID pairs. Do not guess IDs here — wrong
/// names are worse than "unknown". Only add a pair after it's been seen on
/// real hardware (e.g. via `system_profiler SPUSBDataType` on macOS).
///
/// Add entries as:
/// KnownDevice { vendor_id: 0x0000, product_id: 0x0000, name: "Vendor Model", kind: DeviceKind::Scanner },
pub static KNOWN_DEVICES: &[KnownDevice] = &[KnownDevice {
    vendor_id: 0x0581,
    product_id: 0x0115,
    name: "LWTEK USB Barcode Scanner",
    kind: DeviceKind::Scanner,
}];

pub fn lookup(vendor_id: u16, product_id: u16) -> Option<&'static KnownDevice> {
    KNOWN_DEVICES
        .iter()
        .find(|d| d.vendor_id == vendor_id && d.product_id == product_id)
}
