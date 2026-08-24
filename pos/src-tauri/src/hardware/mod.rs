mod catalog;

use hidapi::HidApi;
use serde::Serialize;

// Scanner/Printer are unused until catalog.rs gets real entries.
#[allow(dead_code)]
#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DeviceKind {
    Scanner,
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
    pub kind: DeviceKind,
    pub recognized: bool,
    pub driver_status: DriverStatus,
}

#[tauri::command]
pub fn list_hardware() -> Result<Vec<HardwareDevice>, String> {
    let api = HidApi::new().map_err(|e| e.to_string())?;

    let devices = api
        .device_list()
        .map(|info| {
            let vendor_id = info.vendor_id();
            let product_id = info.product_id();
            match catalog::lookup(vendor_id, product_id) {
                Some(known) => HardwareDevice {
                    vendor_id,
                    product_id,
                    name: Some(known.name.to_string()),
                    kind: known.kind,
                    recognized: true,
                    driver_status: DriverStatus::NotNeeded,
                },
                None => HardwareDevice {
                    vendor_id,
                    product_id,
                    name: None,
                    kind: DeviceKind::Unknown,
                    recognized: false,
                    driver_status: DriverStatus::NotNeeded,
                },
            }
        })
        .collect();

    Ok(devices)
}
