mod catalog;
pub mod os_printers;
pub mod receipt;

use hidapi::HidApi;
use serde::Serialize;

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DeviceKind {
    Scanner,
    // Unused until catalog.rs gets a recognized printer entry.
    #[allow(dead_code)]
    Printer,
    Unknown,
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DriverStatus {
    NotNeeded,
    // Available and Installed are reserved for a future driver-install flow.
}

#[derive(Serialize)]
pub struct HardwareDevice {
    pub vendor_id: u16,
    pub product_id: u16,
    pub name: Option<String>,
    /// Manufacturer string reported by the device itself (USB iManufacturer
    /// descriptor), independent of whether it's in our static catalog.
    pub manufacturer: Option<String>,
    /// Product string reported by the device itself (USB iProduct
    /// descriptor), independent of whether it's in our static catalog.
    pub product: Option<String>,
    pub kind: DeviceKind,
    pub recognized: bool,
    pub driver_status: DriverStatus,
}

#[tauri::command]
pub fn list_hardware() -> Result<Vec<HardwareDevice>, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;

    let mut devices: Vec<HardwareDevice> = Vec::new();

    for info in api.device_list() {
        let vendor_id = info.vendor_id();
        let product_id = info.product_id();

        // A single physical device usually exposes several HID interfaces
        // (e.g. a mouse's pointer + consumer-control + macro interfaces),
        // each a separate device_list() entry. Collapse to one row per
        // vendor/product pair — the interfaces carry no user-facing info.
        if devices
            .iter()
            .any(|d| d.vendor_id == vendor_id && d.product_id == product_id)
        {
            continue;
        }

        let manufacturer = info.manufacturer_string().map(|s| s.to_string());
        let product = info.product_string().map(|s| s.to_string());

        devices.push(match catalog::lookup(vendor_id, product_id) {
            Some(known) => HardwareDevice {
                vendor_id,
                product_id,
                name: Some(known.name.to_string()),
                manufacturer,
                product,
                kind: known.kind,
                recognized: true,
                driver_status: DriverStatus::NotNeeded,
            },
            None => {
                // Not in our curated catalog, but the device may still
                // self-report a readable name over USB — better than
                // showing "unknown device" when we don't have to.
                let fallback_name = match (&manufacturer, &product) {
                    (Some(m), Some(p)) => Some(format!("{m} {p}")),
                    (None, Some(p)) => Some(p.clone()),
                    (Some(m), None) => Some(m.clone()),
                    (None, None) => None,
                };
                HardwareDevice {
                    vendor_id,
                    product_id,
                    name: fallback_name,
                    manufacturer,
                    product,
                    kind: DeviceKind::Unknown,
                    recognized: false,
                    driver_status: DriverStatus::NotNeeded,
                }
            }
        });
    }

    Ok(devices)
}
