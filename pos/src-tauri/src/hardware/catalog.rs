use super::DeviceKind;

pub struct KnownDevice {
    pub vendor_id: u16,
    pub product_id: u16,
    pub name: &'static str,
    pub kind: DeviceKind,
}

/// Recognized scanner/printer VID:PID pairs. Empty until real hardware is
/// tested — do not guess IDs here, wrong names are worse than "unknown".
///
/// Add entries as:
/// KnownDevice { vendor_id: 0x0000, product_id: 0x0000, name: "Vendor Model", kind: DeviceKind::Scanner },
pub static KNOWN_DEVICES: &[KnownDevice] = &[];

pub fn lookup(vendor_id: u16, product_id: u16) -> Option<&'static KnownDevice> {
    KNOWN_DEVICES
        .iter()
        .find(|d| d.vendor_id == vendor_id && d.product_id == product_id)
}
